var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { AcquisitionManager } from "code-push/script/acquisition-sdk";
import { HttpRequester } from "./httpRequester";
import { NativeAppInfo } from "./nativeAppInfo";
import { Device } from "@capacitor/device";
/**
 * Interacts with the CodePush Acquisition SDK.
 */
export class Sdk {
    /**
     * Reads the CodePush configuration and creates an AcquisitionManager instance using it.
     */
    static getAcquisitionManager(userDeploymentKey, contentType) {
        return __awaiter(this, void 0, void 0, function* () {
            const resolveManager = () => {
                if (userDeploymentKey !== Sdk.DefaultConfiguration.deploymentKey || contentType) {
                    var customConfiguration = {
                        deploymentKey: userDeploymentKey || Sdk.DefaultConfiguration.deploymentKey,
                        serverUrl: Sdk.DefaultConfiguration.serverUrl,
                        ignoreAppVersion: Sdk.DefaultConfiguration.ignoreAppVersion,
                        appVersion: Sdk.DefaultConfiguration.appVersion,
                        clientUniqueId: Sdk.DefaultConfiguration.clientUniqueId
                    };
                    var requester = new HttpRequester(contentType);
                    var customAcquisitionManager = new AcquisitionManager(requester, customConfiguration);
                    return Promise.resolve(customAcquisitionManager);
                }
                else if (Sdk.DefaultConfiguration.deploymentKey) {
                    return Promise.resolve(Sdk.DefaultAcquisitionManager);
                }
                else {
                    return Promise.reject(new Error("No deployment key provided, please provide a default one in your config.xml or specify one in the call to checkForUpdate() or sync()."));
                }
            };
            if (Sdk.DefaultAcquisitionManager) {
                return resolveManager();
            }
            else {
                let serverUrl = null;
                try {
                    serverUrl = yield NativeAppInfo.getServerURL();
                }
                catch (e) {
                    throw new Error("Could not get the CodePush configuration. Please check your config.xml file.");
                }
                let appVersion = null;
                try {
                    appVersion = yield NativeAppInfo.getApplicationVersion();
                }
                catch (e) {
                    throw new Error("Could not get the app version. Please check your config.xml file.");
                }
                let deploymentKey = null;
                try {
                    deploymentKey = yield NativeAppInfo.getDeploymentKey();
                }
                catch (e) { }
                const device = yield Device.getId();
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
        });
    }
    /**
     * Reports the deployment status to the CodePush server.
     */
    static reportStatusDeploy(pkg, status, currentDeploymentKey, previousLabelOrAppVersion, previousDeploymentKey, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const acquisitionManager = yield Sdk.getAcquisitionManager(currentDeploymentKey, "application/json");
                acquisitionManager.reportStatusDeploy(pkg, status, previousLabelOrAppVersion, previousDeploymentKey, callback);
            }
            catch (e) {
                callback && callback(e);
            }
        });
    }
    /**
     * Reports the download status to the CodePush server.
     */
    static reportStatusDownload(pkg, deploymentKey, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const acquisitionManager = yield Sdk.getAcquisitionManager(deploymentKey, "application/json");
                acquisitionManager.reportStatusDownload(pkg, callback);
            }
            catch (e) {
                callback && callback(new Error("An error occured while reporting the download status. " + e));
            }
        });
    }
}
//# sourceMappingURL=sdk.js.map