import { AcquisitionStatus, NativeUpdateNotification } from "code-push/script/acquisition-sdk";
import { Callback, ErrorCallback, SuccessCallback } from "./callbackUtil";
import { CodePushUtil } from "./codePushUtil";
import { InstallMode } from "./installMode";
import { LocalPackage } from "./localPackage";
import { NativeAppInfo } from "./nativeAppInfo";
import { CodePush as NativeCodePush } from "./nativeCodePushPlugin";
import { DownloadProgress, ILocalPackage, IPackage, IRemotePackage } from "./package";
import { RemotePackage } from "./remotePackage";
import { Sdk } from "./sdk";
import { SyncOptions, UpdateDialogOptions } from "./syncOptions";
import { SyncStatus } from "./syncStatus";
import { ConfirmResult, Dialog } from "@capacitor/dialog";

interface CodePushCapacitorPlugin {

  /**
   * Get the current package information.
   *
   * @returns The currently deployed package information.
   */
  getCurrentPackage(): Promise<ILocalPackage>;

  /**
   * Gets the pending package information, if any. A pending package is one that has been installed but the application still runs the old code.
   * This happens only after a package has been installed using ON_NEXT_RESTART or ON_NEXT_RESUME mode, but the application was not restarted/resumed yet.
   */
  getPendingPackage(): Promise<ILocalPackage>;

  /**
   * Checks with the CodePush server if an update package is available for download.
   *
   * @param querySuccess Callback invoked in case of a successful response from the server.
   *                     The callback takes one RemotePackage parameter. A non-null package is a valid update.
   *                     A null package means the application is up to date for the current native application version.
   * @param queryError Optional callback invoked in case of an error.
   * @param deploymentKey Optional deployment key that overrides the config.xml setting.
   */
  checkForUpdate(querySuccess: SuccessCallback<IRemotePackage>, queryError?: ErrorCallback, deploymentKey?: string): void;

  /**
   * Notifies the plugin that the update operation succeeded and that the application is ready.
   * Calling this function is required on the first run after an update. On every subsequent application run, calling this function is a noop.
   * If using sync API, calling this function is not required since sync calls it internally.
   */
  notifyApplicationReady(): Promise<void>;

  /**
   * Reloads the application. If there is a pending update package installed using ON_NEXT_RESTART or ON_NEXT_RESUME modes, the update
   * will be immediately visible to the user. Otherwise, calling this function will simply reload the current version of the application.
   */
  restartApplication(): Promise<void>;

  /**
   * Convenience method for installing updates in one method call.
   * This method is provided for simplicity, and its behavior can be replicated by using window.codePush.checkForUpdate(), RemotePackage's download() and LocalPackage's install() methods.
   *
   * The algorithm of this method is the following:
   * - Checks for an update on the CodePush server.
   * - If an update is available
   *         - If the update is mandatory and the alertMessage is set in options, the user will be informed that the application will be updated to the latest version.
   *           The update package will then be downloaded and applied.
   *         - If the update is not mandatory and the confirmMessage is set in options, the user will be asked if they want to update to the latest version.
   *           If they decline, the syncCallback will be invoked with SyncStatus.UPDATE_IGNORED.
   *         - Otherwise, the update package will be downloaded and applied with no user interaction.
   * - If no update is available on the server, or if a previously rolled back update is available and the ignoreFailedUpdates is set to true, the syncCallback will be invoked with the SyncStatus.UP_TO_DATE.
   * - If an error occurs during checking for update, downloading or installing it, the syncCallback will be invoked with the SyncStatus.ERROR.
   *
   * @param syncOptions Optional SyncOptions parameter configuring the behavior of the sync operation.
   * @param downloadProgress Optional callback invoked during the download process. It is called several times with one DownloadProgress parameter.
   * @returns The status of the sync operation. The possible statuses are defined by the SyncStatus enum.
   *
   */
  sync(syncOptions?: SyncOptions, downloadProgress?: SuccessCallback<DownloadProgress>): Promise<SyncStatus>;
}

/**
 * This is the entry point to Cordova CodePush SDK.
 * It provides the following features to the app developer:
 * - polling the server for new versions of the app
 * - notifying the plugin that the application loaded successfully after an update
 * - getting information about the currently deployed package
 */
class CodePush implements CodePushCapacitorPlugin {
  /**
   * The default options for the sync command.
   */
  private static DefaultSyncOptions: SyncOptions;
  /**
   * The default UI for the update dialog, in case it is enabled.
   * Please note that the update dialog is disabled by default.
   */
  private static DefaultUpdateDialogOptions: UpdateDialogOptions;
  /**
   * Whether or not a sync is currently in progress.
   */
  private static SyncInProgress: boolean;

  /**
   * Notifies the plugin that the update operation succeeded and that the application is ready.
   * Calling this function is required on the first run after an update. On every subsequent application run, calling this function is a noop.
   * If using sync API, calling this function is not required since sync calls it internally.
   */
  public notifyApplicationReady(): Promise<void> {
    return NativeCodePush.notifyApplicationReady();
  }

  /**
   * Reloads the application. If there is a pending update package installed using ON_NEXT_RESTART or ON_NEXT_RESUME modes, the update
   * will be immediately visible to the user. Otherwise, calling this function will simply reload the current version of the application.
   */
  public restartApplication(): Promise<void> {
    return NativeCodePush.restartApplication();
  }

  /**
   * Reports an application status back to the server.
   * !!! This function is called from the native side, please make changes accordingly. !!!
   */
  public reportStatus(status: number, label: string, appVersion: string, deploymentKey: string, lastVersionLabelOrAppVersion?: string, lastVersionDeploymentKey?: string) {
    if (((!label && appVersion === lastVersionLabelOrAppVersion) || label === lastVersionLabelOrAppVersion)
      && deploymentKey === lastVersionDeploymentKey) {
      // No-op since the new appVersion and label is exactly the same as the previous
      // (the app might have been updated via a direct or HockeyApp deployment).
      return;
    }

    var createPackageForReporting = (label: string, appVersion: string): IPackage => {
      return {
        /* The SDK only reports the label and appVersion.
           The rest of the properties are added for type safety. */
        label, appVersion, deploymentKey,
        description: null, isMandatory: false,
        packageHash: null, packageSize: null,
        failedInstall: false
      };
    };

    var reportDone = (error: Error) => {
      var reportArgs = {
        status,
        label,
        appVersion,
        deploymentKey,
        lastVersionLabelOrAppVersion,
        lastVersionDeploymentKey
      };

      if (error) {
        CodePushUtil.logError(`An error occurred while reporting status: ${JSON.stringify(reportArgs)}`, error);
        NativeCodePush.reportFailed({ statusReport: reportArgs });
      } else {
        CodePushUtil.logMessage(`Reported status: ${JSON.stringify(reportArgs)}`);
        NativeCodePush.reportSucceeded({ statusReport: reportArgs });
      }
    };

    switch (status) {
      case ReportStatus.STORE_VERSION:
        Sdk.reportStatusDeploy(null, AcquisitionStatus.DeploymentSucceeded, deploymentKey, lastVersionLabelOrAppVersion, lastVersionDeploymentKey, reportDone);
        break;
      case ReportStatus.UPDATE_CONFIRMED:
        Sdk.reportStatusDeploy(createPackageForReporting(label, appVersion), AcquisitionStatus.DeploymentSucceeded, deploymentKey, lastVersionLabelOrAppVersion, lastVersionDeploymentKey, reportDone);
        break;
      case ReportStatus.UPDATE_ROLLED_BACK:
        Sdk.reportStatusDeploy(createPackageForReporting(label, appVersion), AcquisitionStatus.DeploymentFailed, deploymentKey, lastVersionLabelOrAppVersion, lastVersionDeploymentKey, reportDone);
        break;
    }
  }

  /**
   * Get the current package information.
   *
   * @returns The currently deployed package information.
   */
  public async getCurrentPackage(): Promise<ILocalPackage> {
    const pendingUpdate = await NativeAppInfo.isPendingUpdate();
    var packageInfoFile = pendingUpdate ? LocalPackage.OldPackageInfoFile : LocalPackage.PackageInfoFile;
    return new Promise<ILocalPackage>((resolve, reject) => {
      LocalPackage.getPackageInfoOrNull(packageInfoFile, resolve as any, reject);
    });
  }

  /**
   * Gets the pending package information, if any. A pending package is one that has been installed but the application still runs the old code.
   * This happens only after a package has been installed using ON_NEXT_RESTART or ON_NEXT_RESUME mode, but the application was not restarted/resumed yet.
   */
  public async getPendingPackage(): Promise<ILocalPackage> {
    const pendingUpdate = await NativeAppInfo.isPendingUpdate();
    if (!pendingUpdate) return null;

    return new Promise<ILocalPackage>((resolve, reject) => {
      LocalPackage.getPackageInfoOrNull(LocalPackage.PackageInfoFile, resolve as any, reject);
    });
  }

  /**
   * Checks with the CodePush server if an update package is available for download.
   *
   * @param querySuccess Callback invoked in case of a successful response from the server.
   *                     The callback takes one RemotePackage parameter. A non-null package is a valid update.
   *                     A null package means the application is up to date for the current native application version.
   * @param queryError Optional callback invoked in case of an error.
   * @param deploymentKey Optional deployment key that overrides the config.xml setting.
   */
  public checkForUpdate(querySuccess: SuccessCallback<IRemotePackage>, queryError?: ErrorCallback, deploymentKey?: string): void {
    try {
      const callback: Callback<RemotePackage | NativeUpdateNotification> = async (error: Error, remotePackageOrUpdateNotification: IRemotePackage | NativeUpdateNotification) => {
        if (error) {
          CodePushUtil.invokeErrorCallback(error, queryError);
        } else {
          const appUpToDate = () => {
            CodePushUtil.logMessage("App is up to date.");
            querySuccess && querySuccess(null);
          };

          if (remotePackageOrUpdateNotification) {
            if ((<NativeUpdateNotification>remotePackageOrUpdateNotification).updateAppVersion) {
              /* There is an update available for a different version. In the current version of the plugin, we treat that as no update. */
              CodePushUtil.logMessage("An update is available, but it is targeting a newer binary version than you are currently running.");
              appUpToDate();
            } else {
              /* There is an update available for the current version. */
              var remotePackage: RemotePackage = <RemotePackage>remotePackageOrUpdateNotification;
              const installFailed = await NativeAppInfo.isFailedUpdate(remotePackage.packageHash);
              var result: RemotePackage = new RemotePackage();
              result.appVersion = remotePackage.appVersion;
              result.deploymentKey = deploymentKey; // server does not send back the deployment key
              result.description = remotePackage.description;
              result.downloadUrl = remotePackage.downloadUrl;
              result.isMandatory = remotePackage.isMandatory;
              result.label = remotePackage.label;
              result.packageHash = remotePackage.packageHash;
              result.packageSize = remotePackage.packageSize;
              result.failedInstall = installFailed;
              CodePushUtil.logMessage("An update is available. " + JSON.stringify(result));
              querySuccess && querySuccess(result);
            }
          } else {
            appUpToDate();
          }
        }
      };

      const queryUpdate = async () => {
        try {
          const acquisitionManager = await Sdk.getAcquisitionManager(deploymentKey);
            const localPackage = await LocalPackage.getCurrentOrDefaultPackage();
            try {
              const currentBinaryVersion = await NativeAppInfo.getApplicationVersion();
              localPackage.appVersion = currentBinaryVersion;
            } catch (e) {
              /* Nothing to do */
              /* TODO : Why ? */
            }
            CodePushUtil.logMessage("Checking for update.");
            acquisitionManager.queryUpdateWithCurrentPackage(localPackage, callback);
        } catch (e) {
          CodePushUtil.invokeErrorCallback(e, queryError);
        }
      };

      if (deploymentKey) {
        queryUpdate();
      } else {
        NativeAppInfo.getDeploymentKey()
          .then(
            (defaultDeploymentKey) => {
              deploymentKey = defaultDeploymentKey;
              queryUpdate();
            },
            (deploymentKeyError) => {
              CodePushUtil.invokeErrorCallback(deploymentKeyError, queryError);
            }
          );
      }
    } catch (e) {
      CodePushUtil.invokeErrorCallback(new Error("An error occurred while querying for updates." + CodePushUtil.getErrorMessage(e)), queryError);
    }
  }

  /**
   * Convenience method for installing updates in one method call.
   * This method is provided for simplicity, and its behavior can be replicated by using window.codePush.checkForUpdate(), RemotePackage's download() and LocalPackage's install() methods.
   * If another sync is already running, it yields SyncStatus.IN_PROGRESS.
   *
   * The algorithm of this method is the following:
   * - Checks for an update on the CodePush server.
   * - If an update is available
   *         - If the update is mandatory and the alertMessage is set in options, the user will be informed that the application will be updated to the latest version.
   *           The update package will then be downloaded and applied.
   *         - If the update is not mandatory and the confirmMessage is set in options, the user will be asked if they want to update to the latest version.
   *           If they decline, the syncCallback will be invoked with SyncStatus.UPDATE_IGNORED.
   *         - Otherwise, the update package will be downloaded and applied with no user interaction.
   * - If no update is available on the server, the syncCallback will be invoked with the SyncStatus.UP_TO_DATE.
   * - If an error occurs during checking for update, downloading or installing it, the syncCallback will be invoked with the SyncStatus.ERROR.
   *
   * @param syncOptions Optional SyncOptions parameter configuring the behavior of the sync operation.
   * @param downloadProgress Optional callback invoked during the download process. It is called several times with one DownloadProgress parameter.
   */
  public async sync(syncOptions?: SyncOptions, downloadProgress?: SuccessCallback<DownloadProgress>): Promise<SyncStatus> {
    return await new Promise(
      (resolve, reject) => {
        /* Check if a sync is already in progress */
        if (CodePush.SyncInProgress) {
          /* A sync is already in progress */
          CodePushUtil.logMessage("Sync already in progress.");
          resolve(SyncStatus.IN_PROGRESS);
        }

        /* Create a callback that resets the SyncInProgress flag when the sync is complete
        * If the sync status is a result status, then the sync must be complete and the flag must be updated
        * Otherwise, do not change the flag and trigger the syncCallback as usual
        */
        const syncCallbackAndUpdateSyncInProgress: Callback<SyncStatus> = (err: Error | null, result: SyncStatus | null): void => {
          if (err) {
            syncOptions?.onSyncError && syncOptions.onSyncError(err);
            CodePush.SyncInProgress = false;
            reject(err);
          } else {
            /* Call the user's callback */
            syncOptions?.onSyncStatusChanged && syncOptions.onSyncStatusChanged(result);

            /* Check if the sync operation is over */
            switch (result) {
              case SyncStatus.ERROR:
              case SyncStatus.UP_TO_DATE:
              case SyncStatus.UPDATE_IGNORED:
              case SyncStatus.UPDATE_INSTALLED:
                /* The sync has completed */
                CodePush.SyncInProgress = false;
                resolve(result);
                break;
              default:
                /* The sync is not yet complete, so do nothing */
                break;
            }
          }
        };

        /* Begin the sync */
        CodePush.SyncInProgress = true;
        this.syncInternal(
          syncCallbackAndUpdateSyncInProgress,
          syncOptions,
          downloadProgress,
        );
      }
    );
  }

  /**
   * Convenience method for installing updates in one method call.
   * This method is provided for simplicity, and its behavior can be replicated by using window.codePush.checkForUpdate(), RemotePackage's download() and LocalPackage's install() methods.
   *
   * A helper function for the sync function. It does not check if another sync is ongoing.
   *
   * @param syncCallback Optional callback to be called with the status of the sync operation.
   *                     The callback will be called only once, and the possible statuses are defined by the SyncStatus enum.
   * @param syncOptions Optional SyncOptions parameter configuring the behavior of the sync operation.
   * @param downloadProgress Optional callback invoked during the download process. It is called several times with one DownloadProgress parameter.
   *
   */
  private syncInternal(syncCallback?: Callback<any>, syncOptions?: SyncOptions, downloadProgress?: SuccessCallback<DownloadProgress>): void {

    /* No options were specified, use default */
    const defaultSyncOptions = this.getDefaultSyncOptions();
    if (!syncOptions) {
      syncOptions = defaultSyncOptions;
    } else {
      /* Some options were specified */
      /* Handle dialog options */
      const defaultDialogOptions = this.getDefaultUpdateDialogOptions();
      if (syncOptions.updateDialog) {
        if (typeof syncOptions.updateDialog !== typeof ({})) {
          /* updateDialog set to true condition, use default options */
          syncOptions.updateDialog = defaultDialogOptions;
        } else {
          /* some options were specified, merge with default */
          CodePushUtil.copyUnassignedMembers(defaultDialogOptions, syncOptions.updateDialog);
        }
      }

      /* Handle other options. Dialog options will not be overwritten. */
      CodePushUtil.copyUnassignedMembers(defaultSyncOptions, syncOptions);
    }

    this.notifyApplicationReady();

    const onError = (error: Error) => {
      CodePushUtil.logError("An error occurred during sync.", error);
      syncCallback && syncCallback(error, SyncStatus.ERROR);
    };

    const onInstallSuccess = (appliedWhen: InstallMode) => {
      switch (appliedWhen) {
        case InstallMode.ON_NEXT_RESTART:
          CodePushUtil.logMessage("Update is installed and will be run on the next app restart.");
          break;

        case InstallMode.ON_NEXT_RESUME:
          if (syncOptions.minimumBackgroundDuration > 0) {
            CodePushUtil.logMessage(`Update is installed and will be run after the app has been in the background for at least ${syncOptions.minimumBackgroundDuration} seconds.`);
          } else {
            CodePushUtil.logMessage("Update is installed and will be run when the app next resumes.");
          }

          break;
      }

      syncCallback && syncCallback(null, SyncStatus.UPDATE_INSTALLED);
    };

    const onDownloadSuccess = (localPackage: ILocalPackage) => {
      syncCallback && syncCallback(null, SyncStatus.INSTALLING_UPDATE);
      localPackage.install(syncOptions).then(onInstallSuccess, onError);
    };

    const downloadAndInstallUpdate = (remotePackage: RemotePackage) => {
      syncCallback && syncCallback(null, SyncStatus.DOWNLOADING_PACKAGE);
      remotePackage.download(downloadProgress).then(onDownloadSuccess, onError);
    };

    const onUpdate = async (remotePackage: RemotePackage) => {
      if (remotePackage === null) {
        /* Then the app is up to date */
        syncCallback && syncCallback(null, SyncStatus.UP_TO_DATE);
      } else {
        if (remotePackage.failedInstall && syncOptions.ignoreFailedUpdates) {
          CodePushUtil.logMessage("An update is available, but it is being ignored due to have been previously rolled back.");
          syncCallback && syncCallback(null, SyncStatus.UPDATE_IGNORED);
        } else {
          if (syncOptions.updateDialog) {
            CodePushUtil.logMessage("Awaiting user action.");
            syncCallback && syncCallback(null, SyncStatus.AWAITING_USER_ACTION);

            const dlgOpts: UpdateDialogOptions = <UpdateDialogOptions>syncOptions.updateDialog;

            if (remotePackage.isMandatory) {
              /* Alert user */
              const message = dlgOpts.appendReleaseDescription ?
                dlgOpts.mandatoryUpdateMessage + dlgOpts.descriptionPrefix + remotePackage.description :
                dlgOpts.mandatoryUpdateMessage;
              await Dialog.alert(
                {
                  message,
                  title: dlgOpts.updateTitle,
                  buttonTitle: dlgOpts.mandatoryContinueButtonLabel
                }
              );
              downloadAndInstallUpdate(remotePackage);
            } else {
              /* Confirm update with user */
              const message = dlgOpts.appendReleaseDescription ?
                dlgOpts.optionalUpdateMessage + dlgOpts.descriptionPrefix + remotePackage.description
                : dlgOpts.optionalUpdateMessage;

              const confirmResult: ConfirmResult = await Dialog.confirm({
                message,
                title: dlgOpts.updateTitle,
                okButtonTitle: dlgOpts.optionalInstallButtonLabel,
                cancelButtonTitle: dlgOpts.optionalIgnoreButtonLabel
              });

              if (confirmResult.value === true) {
                /* Install */
                downloadAndInstallUpdate(remotePackage);
              } else {
                /* Cancel */
                CodePushUtil.logMessage("User cancelled the update.");
                syncCallback && syncCallback(null, SyncStatus.UPDATE_IGNORED);
              }
            }
          } else {
            /* No user interaction */
            downloadAndInstallUpdate(remotePackage);
          }
        }
      }
    };

    syncCallback && syncCallback(null, SyncStatus.CHECKING_FOR_UPDATE);
    this.checkForUpdate(onUpdate, onError, syncOptions.deploymentKey);
  }

  /**
   * Returns the default options for the CodePush sync operation.
   * If the options are not defined yet, the static DefaultSyncOptions member will be instantiated.
   */
  private getDefaultSyncOptions(): SyncOptions {
    if (!CodePush.DefaultSyncOptions) {
      CodePush.DefaultSyncOptions = {
        ignoreFailedUpdates: true,
        installMode: InstallMode.ON_NEXT_RESTART,
        minimumBackgroundDuration: 0,
        mandatoryInstallMode: InstallMode.IMMEDIATE,
        updateDialog: false,
        deploymentKey: undefined
      };
    }

    return CodePush.DefaultSyncOptions;
  }

  /**
   * Returns the default options for the update dialog.
   * Please note that the dialog is disabled by default.
   */
  private getDefaultUpdateDialogOptions(): UpdateDialogOptions {
    if (!CodePush.DefaultUpdateDialogOptions) {
      CodePush.DefaultUpdateDialogOptions = {
        updateTitle: "Update available",
        mandatoryUpdateMessage: "An update is available that must be installed.",
        mandatoryContinueButtonLabel: "Continue",
        optionalUpdateMessage: "An update is available. Would you like to install it?",
        optionalInstallButtonLabel: "Install",
        optionalIgnoreButtonLabel: "Ignore",
        appendReleaseDescription: false,
        descriptionPrefix: " Description: "
      };
    }

    return CodePush.DefaultUpdateDialogOptions;
  }
}

/**
 * Defines the application statuses reported from the native layer.
 * !!! This enum is defined in native code as well, please make changes accordingly. !!!
 */
enum ReportStatus {
  STORE_VERSION = 0,
  UPDATE_CONFIRMED = 1,
  UPDATE_ROLLED_BACK = 2
}

export const codePush = new CodePush();
(window as any).codePush = codePush;
