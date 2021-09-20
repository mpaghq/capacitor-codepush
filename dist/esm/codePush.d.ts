import { ErrorCallback, SuccessCallback } from "./callbackUtil";
import { DownloadProgress, ILocalPackage, IRemotePackage } from "./package";
import { SyncOptions } from "./syncOptions";
import { SyncStatus } from "./syncStatus";
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
declare class CodePush implements CodePushCapacitorPlugin {
    /**
     * The default options for the sync command.
     */
    private static DefaultSyncOptions;
    /**
     * The default UI for the update dialog, in case it is enabled.
     * Please note that the update dialog is disabled by default.
     */
    private static DefaultUpdateDialogOptions;
    /**
     * Whether or not a sync is currently in progress.
     */
    private static SyncInProgress;
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
     * Reports an application status back to the server.
     * !!! This function is called from the native side, please make changes accordingly. !!!
     */
    reportStatus(status: number, label: string, appVersion: string, deploymentKey: string, lastVersionLabelOrAppVersion?: string, lastVersionDeploymentKey?: string): void;
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
    sync(syncOptions?: SyncOptions, downloadProgress?: SuccessCallback<DownloadProgress>): Promise<SyncStatus>;
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
    private syncInternal;
    /**
     * Returns the default options for the CodePush sync operation.
     * If the options are not defined yet, the static DefaultSyncOptions member will be instantiated.
     */
    private getDefaultSyncOptions;
    /**
     * Returns the default options for the update dialog.
     * Please note that the dialog is disabled by default.
     */
    private getDefaultUpdateDialogOptions;
}
export declare const codePush: CodePush | null;
export {};
