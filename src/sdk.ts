import { AcquisitionManager, Configuration } from "code-push/script/acquisition-sdk";
import { Callback } from "./callbackUtil";
import { HttpRequester } from "./httpRequester";
import { NativeAppInfo } from "./nativeAppInfo";
import { IPackage } from "./package";
import { Device } from "@capacitor/device";

/**
 * Interacts with the CodePush Acquisition SDK.
 */
export class Sdk {

    private static DefaultAcquisitionManager: AcquisitionManager;
    private static DefaultConfiguration: Configuration;

    /**
     * Reads the CodePush configuration and creates an AcquisitionManager instance using it.
     */
    public static async getAcquisitionManager(userDeploymentKey?: string, contentType?: string): Promise<AcquisitionManager> {
        const resolveManager = (): Promise<AcquisitionManager> => {
            if (userDeploymentKey !== Sdk.DefaultConfiguration.deploymentKey || contentType) {
                var customConfiguration: Configuration = {
                    deploymentKey: userDeploymentKey || Sdk.DefaultConfiguration.deploymentKey,
                    serverUrl: Sdk.DefaultConfiguration.serverUrl,
                    ignoreAppVersion: Sdk.DefaultConfiguration.ignoreAppVersion,
                    appVersion: Sdk.DefaultConfiguration.appVersion,
                    clientUniqueId: Sdk.DefaultConfiguration.clientUniqueId
                };
                var requester = new HttpRequester(contentType);
                var customAcquisitionManager: AcquisitionManager = new AcquisitionManager(requester, customConfiguration);
                return Promise.resolve(customAcquisitionManager);
            } else if (Sdk.DefaultConfiguration.deploymentKey) {
                return Promise.resolve(Sdk.DefaultAcquisitionManager);
            } else {
                return Promise.reject(new Error("No deployment key provided, please provide a default one in your config.xml or specify one in the call to checkForUpdate() or sync()."));
            }
        };

        if (Sdk.DefaultAcquisitionManager) {
            return resolveManager();
        } else {
            let serverUrl = null;
            try {
                serverUrl = await NativeAppInfo.getServerURL();
            } catch (e) {
                throw new Error("Could not get the CodePush configuration. Please check your config.xml file.");
            }

            let appVersion = null;
            try {
                appVersion = await NativeAppInfo.getApplicationVersion();
            } catch (e) {
                throw new Error("Could not get the app version. Please check your config.xml file.");
            }

            let deploymentKey = null;
            try {
                deploymentKey = await NativeAppInfo.getDeploymentKey();
            } catch (e) {}

            const device = await Device.getId();
            Sdk.DefaultConfiguration = {
                deploymentKey,
                serverUrl,
                ignoreAppVersion: false,
                appVersion,
                clientUniqueId: device.identifier
            };

            if (deploymentKey) {
                Sdk.DefaultAcquisitionManager = new AcquisitionManager(new HttpRequester(), Sdk.DefaultConfiguration);
            }

            return resolveManager();
        }
    }

    /**
     * Reports the deployment status to the CodePush server.
     */
    public static async reportStatusDeploy(pkg?: IPackage, status?: string, currentDeploymentKey?: string, previousLabelOrAppVersion?: string, previousDeploymentKey?: string, callback?: Callback<void>) {
        try {
            const acquisitionManager = await Sdk.getAcquisitionManager(currentDeploymentKey, "application/json");
            acquisitionManager.reportStatusDeploy(pkg, status, previousLabelOrAppVersion, previousDeploymentKey, callback);
        } catch (e) {
            callback && callback(e);
        }
    }

    /**
     * Reports the download status to the CodePush server.
     */
    public static async reportStatusDownload(pkg: IPackage, deploymentKey?: string, callback?: Callback<void>) {
        try {
            const acquisitionManager = await Sdk.getAcquisitionManager(deploymentKey, "application/json");
            acquisitionManager.reportStatusDownload(pkg, callback);
        } catch (e) {
            callback && callback(new Error("An error occured while reporting the download status. " + e));
        }
    }
}
