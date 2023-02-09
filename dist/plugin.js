var capacitorPlugin = (function (exports, acquisitionSdk, filesystem, core, http, device, dialog) {
    'use strict';

    /**
     * Callback / error / logging utilities.
     */
    class CodePushUtil {
        /**
         * Performs a copy of all members of fromParameter to toParameter, with the condition that they are unassigned or null in toParameter.
         */
        static copyUnassignedMembers(fromParameter, toParameter) {
            for (let key in fromParameter) {
                if (toParameter[key] === undefined || toParameter[key] === null) {
                    toParameter[key] = fromParameter[key];
                }
            }
        }
        /**
         * Given two Cordova style callbacks for success and error, this function returns a node.js
         * style callback where the error is the first parameter and the result the second.
         */
        static getNodeStyleCallbackFor(successCallback, errorCallback) {
            return (error, result) => {
                if (error) {
                    errorCallback && errorCallback(error);
                }
                else {
                    successCallback && successCallback(result);
                }
            };
        }
        /**
         * Gets the message of an error, if any. Otherwise it returns the empty string.
         */
        static getErrorMessage(e) {
            return e && e.message || e && e.toString() || "";
        }
        /**
         * Logs a message using the CodePush tag.
         */
        static logMessage(msg) {
            console.log(CodePushUtil.TAG + " " + msg);
        }
        /**
         * Logs an error message using the CodePush tag.
         */
        static logError(message, error) {
            const errorMessage = `${message || ""} ${CodePushUtil.getErrorMessage(error)}`;
            const stackTrace = error && error.stack ? `. StackTrace: ${error.stack}` : "";
            console.error(`${CodePushUtil.TAG} ${errorMessage}${stackTrace}`);
        }
    }
    /**
     * Tag used for logging to the console.
     */
    CodePushUtil.TAG = "[CodePush]";
    /**
     * Logs the error to the console and then forwards it to the provided ErrorCallback, if any.
     * TODO: remove me
     */
    CodePushUtil.invokeErrorCallback = (error, errorCallback) => {
        CodePushUtil.logError(null, error);
        errorCallback && errorCallback(error);
    };
    /**
     * Logs the error to the console and then throws the error.
     */
    CodePushUtil.throwError = (error) => {
        CodePushUtil.logError(null, error);
        throw error;
    };

    /**
     * Defines the available install modes for updates.
     */
    exports.InstallMode = void 0;
    (function (InstallMode) {
        /**
         * The update will be applied to the running application immediately. The application will be reloaded with the new content immediately.
         */
        InstallMode[InstallMode["IMMEDIATE"] = 0] = "IMMEDIATE";
        /**
         * The update is downloaded but not installed immediately. The new content will be available the next time the application is started.
         */
        InstallMode[InstallMode["ON_NEXT_RESTART"] = 1] = "ON_NEXT_RESTART";
        /**
         * The udpate is downloaded but not installed immediately. The new content will be available the next time the application is resumed or restarted, whichever event happends first.
         */
        InstallMode[InstallMode["ON_NEXT_RESUME"] = 2] = "ON_NEXT_RESUME";
    })(exports.InstallMode || (exports.InstallMode = {}));

    var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
    /**
     * File utilities for CodePush.
     */
    class FileUtil {
        static directoryExists(directory, path) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const statResult = yield filesystem.Filesystem.stat({ directory, path });
                    // directory for Android, NSFileTypeDirectory for iOS
                    return (statResult.type === "directory" ||
                        statResult.type === "NSFileTypeDirectory");
                }
                catch (error) {
                    return false;
                }
            });
        }
        static writeStringToDataFile(content, path, createIfNotExists, callback) {
            FileUtil.writeStringToFile(content, filesystem.Directory.Data, path, createIfNotExists, callback);
        }
        static fileExists(directory, path) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const statResult = yield filesystem.Filesystem.stat({ directory, path });
                    // file for Android, NSFileTypeRegular for iOS
                    return (statResult.type === "file" || statResult.type === "NSFileTypeRegular");
                }
                catch (error) {
                    return false;
                }
            });
        }
        /**
         * Makes sure the given directory exists and is empty.
         */
        static cleanDataDirectory(path) {
            return __awaiter(this, void 0, void 0, function* () {
                if (yield FileUtil.dataDirectoryExists(path)) {
                    yield FileUtil.deleteDataDirectory(path);
                }
                yield filesystem.Filesystem.mkdir({
                    directory: filesystem.Directory.Data,
                    path,
                    recursive: true,
                });
                const appDir = yield filesystem.Filesystem.getUri({ directory: filesystem.Directory.Data, path });
                return appDir.uri;
            });
        }
        static getUri(fsDir, path) {
            return __awaiter(this, void 0, void 0, function* () {
                const result = yield filesystem.Filesystem.getUri({ directory: fsDir, path });
                return result.uri;
            });
        }
        static getDataUri(path) {
            return FileUtil.getUri(filesystem.Directory.Data, path);
        }
        static dataDirectoryExists(path) {
            return FileUtil.directoryExists(filesystem.Directory.Data, path);
        }
        static copyDirectoryEntriesTo(sourceDir, destinationDir, ignoreList = []) {
            return __awaiter(this, void 0, void 0, function* () {
                /*
                        Native-side exception occurs while trying to copy “.DS_Store” and “__MACOSX” entries generated by macOS, so just skip them
                    */
                if (ignoreList.indexOf(".DS_Store") === -1) {
                    ignoreList.push(".DS_Store");
                }
                if (ignoreList.indexOf("__MACOSX") === -1) {
                    ignoreList.push("__MACOSX");
                }
                // @capacitor/filesystem plugin throw error when destination directory already exists.
                if (yield FileUtil.directoryExists(destinationDir.directory, destinationDir.path)) {
                    const { files } = yield filesystem.Filesystem.readdir(sourceDir);
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        if (ignoreList.includes(file))
                            continue;
                        const sourcePath = sourceDir.path + "/" + file.name;
                        const destPath = destinationDir.path + "/" + file.name;
                        const source = Object.assign(Object.assign({}, sourceDir), { path: sourcePath });
                        const destination = Object.assign(Object.assign({}, destinationDir), { path: destPath });
                        if (yield FileUtil.directoryExists(source.directory, source.path)) {
                            // is directory
                            yield FileUtil.copyDirectoryEntriesTo(source, destination);
                        }
                        else {
                            // is file
                            yield FileUtil.copy(source, destination);
                        }
                    }
                }
                else {
                    yield FileUtil.copy(sourceDir, destinationDir);
                }
            });
        }
        static copy(source, destination) {
            return __awaiter(this, void 0, void 0, function* () {
                yield filesystem.Filesystem.copy({
                    directory: source.directory,
                    from: source.path,
                    to: destination.path,
                    toDirectory: destination.directory,
                });
            });
        }
        /**
         * Recursively deletes the contents of a directory.
         */
        static deleteDataDirectory(path) {
            return __awaiter(this, void 0, void 0, function* () {
                yield filesystem.Filesystem.rmdir({
                    directory: filesystem.Directory.Data,
                    path,
                    recursive: true,
                }).then(() => null);
            });
        }
        /**
         * Deletes a given set of files from a directory.
         */
        static deleteEntriesFromDataDirectory(dirPath, filesToDelete) {
            return __awaiter(this, void 0, void 0, function* () {
                for (const file of filesToDelete) {
                    const path = dirPath + "/" + file;
                    const fileExists = yield FileUtil.fileExists(filesystem.Directory.Data, path);
                    if (!fileExists)
                        continue;
                    try {
                        yield filesystem.Filesystem.deleteFile({ directory: filesystem.Directory.Data, path });
                    }
                    catch (error) {
                        /* If delete fails, silently continue */
                        console.log("Could not delete file: " + path);
                    }
                }
            });
        }
        /**
         * Writes a string to a file.
         */
        static writeStringToFile(data, directory, path, createIfNotExists, callback) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    yield filesystem.Filesystem.writeFile({
                        directory,
                        path,
                        data,
                        encoding: filesystem.Encoding.UTF8,
                    });
                    callback(null, null);
                }
                catch (error) {
                    callback(new Error("Could write the current package information file. Error code: " +
                        error.code), null);
                }
            });
        }
        static readFile(directory, path) {
            return __awaiter(this, void 0, void 0, function* () {
                const result = yield filesystem.Filesystem.readFile({
                    directory,
                    path,
                    encoding: filesystem.Encoding.UTF8,
                });
                return result.data;
            });
        }
        static readDataFile(path) {
            return FileUtil.readFile(filesystem.Directory.Data, path);
        }
    }

    // Type definitions for Apache Cordova CodePush plugin.
    const CodePush = /*#__PURE__*/ core.registerPlugin("CodePush");

    var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
    const DefaultServerUrl = "https://codepush.appcenter.ms/";
    /**
     * Provides information about the native app.
     */
    class NativeAppInfo {
        /**
         * Gets the application build timestamp.
         */
        static getApplicationBuildTime() {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.getNativeBuildTime();
                    return result.value;
                }
                catch (e) {
                    throw new Error("Could not get application timestamp.");
                }
            });
        }
        /**
         * Gets the application version.
         */
        static getApplicationVersion() {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.getAppVersion();
                    return result.value;
                }
                catch (e) {
                    throw new Error("Could not get application version.");
                }
            });
        }
        /**
         * Gets a hash of the `public` folder contents compiled in the app store binary.
         */
        static getBinaryHash() {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.getBinaryHash();
                    return result.value;
                }
                catch (e) {
                    throw new Error("Could not get binary hash.");
                }
            });
        }
        /**
         * Gets the server URL from config.xml by calling into the native platform.
         */
        static getServerURL() {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.getServerURL();
                    return result.value;
                }
                catch (e) {
                    return DefaultServerUrl;
                }
            });
        }
        /**
         * Gets the deployment key from config.xml by calling into the native platform.
         */
        static getDeploymentKey() {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.getDeploymentKey();
                    return result.value;
                }
                catch (e) {
                    throw new Error("Deployment key not found.");
                }
            });
        }
        /**
         * Checks if a package update was previously attempted but failed for a given package hash.
         * Every reverted update is stored such that the application developer has the option to ignore
         * updates that previously failed. This way, an infinite update loop can be prevented in case of a bad update package.
         */
        static isFailedUpdate(packageHash) {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.isFailedUpdate({ packageHash });
                    return result.value;
                }
                catch (e) {
                    /* In case of an error, return false. */
                    return false;
                }
            });
        }
        /**
         * Checks if this is the first application run of a package after it has been applied.
         * The didUpdateCallback callback can be used for migrating data from the old app version to the new one.
         *
         * @param packageHash The hash value of the package.
         * @returns Whether it is the first run after an update.
         */
        static isFirstRun(packageHash) {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.isFirstRun({ packageHash });
                    return result.value;
                }
                catch (e) {
                    /* In case of an error, return false. */
                    return false;
                }
            });
        }
        /**
         * Checks with the native side if there is a pending update.
         */
        static isPendingUpdate() {
            return __awaiter$1(this, void 0, void 0, function* () {
                try {
                    const result = yield CodePush.isPendingUpdate();
                    return result.value;
                }
                catch (e) {
                    /* In case of an error, return false. */
                    return false;
                }
            });
        }
    }

    /**
     * Base class for CodePush packages.
     */
    class Package {
    }

    /**
     * XMLHttpRequest-based implementation of Http.Requester.
     */
    class HttpRequester {
        constructor(contentType) {
            this.contentType = contentType;
        }
        request(verb, url, callbackOrRequestBody, callback) {
            var requestBody;
            var requestCallback = callback;
            // request(verb, url, callback)
            if (!requestCallback && typeof callbackOrRequestBody === "function") {
                requestCallback = callbackOrRequestBody;
            }
            // request(verb, url, requestBody, callback)
            if (typeof callbackOrRequestBody === "string") {
                requestBody = callbackOrRequestBody;
            }
            if (typeof requestBody === "string") {
                try {
                    requestBody = JSON.parse(requestBody); // if it is stringify JSON string, parse
                }
                catch (e) {
                    // do nothing
                }
            }
            var methodName = this.getHttpMethodName(verb);
            if (methodName === null) {
                return requestCallback(new Error("Method Not Allowed"), null);
            }
            const headers = {
                "X-CodePush-Plugin-Name": "cordova-plugin-code-push",
                "X-CodePush-Plugin-Version": "1.11.13",
                "X-CodePush-SDK-Version": "3.1.5"
            };
            if (this.contentType) {
                headers["Content-Type"] = this.contentType;
            }
            const options = {
                method: methodName,
                url,
                headers
            };
            if (methodName === "GET") {
                options.params = requestBody;
            }
            else {
                options.data = requestBody;
            }
            http.Http.request(options).then((nativeRes) => {
                if (typeof nativeRes.data === "object")
                    nativeRes.data = JSON.stringify(nativeRes.data);
                var response = { statusCode: nativeRes.status, body: nativeRes.data };
                requestCallback && requestCallback(null, response);
            });
        }
        /**
         * Gets the HTTP method name as a string.
         * The reason for which this is needed is because the Http.Verb enum corresponds to integer values from native runtime.
         */
        getHttpMethodName(verb) {
            switch (verb) {
                case 0 /* GET */:
                    return "GET";
                case 4 /* DELETE */:
                    return "DELETE";
                case 1 /* HEAD */:
                    return "HEAD";
                case 8 /* PATCH */:
                    return "PATCH";
                case 2 /* POST */:
                    return "POST";
                case 3 /* PUT */:
                    return "PUT";
                case 5 /* TRACE */:
                case 6 /* OPTIONS */:
                case 7 /* CONNECT */:
                default:
                    return null;
            }
        }
    }

    var __awaiter$2 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
    /**
     * Interacts with the CodePush Acquisition SDK.
     */
    class Sdk {
        /**
         * Reads the CodePush configuration and creates an AcquisitionManager instance using it.
         */
        static getAcquisitionManager(userDeploymentKey, contentType) {
            return __awaiter$2(this, void 0, void 0, function* () {
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
                        var customAcquisitionManager = new acquisitionSdk.AcquisitionManager(requester, customConfiguration);
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
                    const device$1 = yield device.Device.getId();
                    Sdk.DefaultConfiguration = {
                        deploymentKey,
                        serverUrl,
                        ignoreAppVersion: false,
                        appVersion,
                        clientUniqueId: device$1.uuid
                    };
                    if (deploymentKey) {
                        Sdk.DefaultAcquisitionManager = new acquisitionSdk.AcquisitionManager(new HttpRequester(), Sdk.DefaultConfiguration);
                    }
                    return resolveManager();
                }
            });
        }
        /**
         * Reports the deployment status to the CodePush server.
         */
        static reportStatusDeploy(pkg, status, currentDeploymentKey, previousLabelOrAppVersion, previousDeploymentKey, callback) {
            return __awaiter$2(this, void 0, void 0, function* () {
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
            return __awaiter$2(this, void 0, void 0, function* () {
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

    var __awaiter$3 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
    /**
     * Defines a local package.
     *
     * !! THIS TYPE IS READ FROM NATIVE CODE AS WELL. ANY CHANGES TO THIS INTERFACE NEEDS TO BE UPDATED IN NATIVE CODE !!
     */
    class LocalPackage extends Package {
        /**
         * Applies this package to the application. The application will be reloaded with this package and on every application launch this package will be loaded.
         * On the first run after the update, the application will wait for a codePush.notifyApplicationReady() call. Once this call is made, the install operation is considered a success.
         * Otherwise, the install operation will be marked as failed, and the application is reverted to its previous version on the next run.
         *
         * @param installOptions Optional parameter used for customizing the installation behavior.
         */
        install(installOptions) {
            return __awaiter$3(this, void 0, void 0, function* () {
                return new Promise((resolve, reject) => __awaiter$3(this, void 0, void 0, function* () {
                    try {
                        CodePushUtil.logMessage("Installing update");
                        if (!installOptions) {
                            installOptions = LocalPackage.getDefaultInstallOptions();
                        }
                        else {
                            CodePushUtil.copyUnassignedMembers(LocalPackage.getDefaultInstallOptions(), installOptions);
                        }
                        var installError = (error) => {
                            CodePushUtil.invokeErrorCallback(error, reject);
                            Sdk.reportStatusDeploy(this, acquisitionSdk.AcquisitionStatus.DeploymentFailed, this.deploymentKey);
                        };
                        let unzipDir;
                        try {
                            unzipDir = yield FileUtil.cleanDataDirectory(LocalPackage.DownloadUnzipDir);
                        }
                        catch (error) {
                            installError(error);
                            return;
                        }
                        try {
                            yield CodePush.unzip({ zipFile: this.localPath, targetDirectory: unzipDir });
                        }
                        catch (unzipError) {
                            installError(new Error("Could not unzip package" + CodePushUtil.getErrorMessage(unzipError)));
                            return;
                        }
                        try {
                            const newPackageLocation = LocalPackage.VersionsDir + "/" + this.packageHash;
                            const deploymentResult = yield LocalPackage.handleDeployment(newPackageLocation);
                            yield this.verifyPackage(deploymentResult);
                            this.localPath = deploymentResult.deployDir;
                            this.finishInstall(deploymentResult.deployDir, installOptions, resolve, installError);
                        }
                        catch (error) {
                            installError(error);
                        }
                    }
                    catch (e) {
                        installError && installError(new Error("An error occured while installing the package. " + CodePushUtil.getErrorMessage(e)));
                    }
                }));
            });
        }
        verifyPackage(deploymentResult) {
            return new Promise((resolve, reject) => {
                var deployDir = deploymentResult.deployDir;
                var verificationFail = (error) => {
                    reject(error);
                };
                var verify = (isSignatureVerificationEnabled, isSignatureAppearedInBundle, publicKey, signature) => {
                    if (isSignatureVerificationEnabled) {
                        if (isSignatureAppearedInBundle) {
                            this.verifyHash(deployDir, this.packageHash, verificationFail, () => {
                                this.verifySignature(deployDir, this.packageHash, publicKey, signature, verificationFail, resolve);
                            });
                        }
                        else {
                            var errorMessage = "Error! Public key was provided but there is no JWT signature within app bundle to verify. " +
                                "Possible reasons, why that might happen: \n" +
                                "1. You've been released CodePush bundle update using version of CodePush CLI that is not support code signing.\n" +
                                "2. You've been released CodePush bundle update without providing --privateKeyPath option.";
                            reject(new Error(errorMessage));
                        }
                    }
                    else {
                        if (isSignatureAppearedInBundle) {
                            CodePushUtil.logMessage("Warning! JWT signature exists in codepush update but code integrity check couldn't be performed because there is no public key configured. " +
                                "Please ensure that public key is properly configured within your application.");
                            // verifyHash
                            this.verifyHash(deployDir, this.packageHash, verificationFail, resolve);
                        }
                        else {
                            if (deploymentResult.isDiffUpdate) {
                                // verifyHash
                                this.verifyHash(deployDir, this.packageHash, verificationFail, resolve);
                            }
                            else {
                                resolve();
                            }
                        }
                    }
                };
                if (deploymentResult.isDiffUpdate) {
                    CodePushUtil.logMessage("Applying diff update");
                }
                else {
                    CodePushUtil.logMessage("Applying full update");
                }
                var isSignatureVerificationEnabled, isSignatureAppearedInBundle;
                var publicKey;
                this.getPublicKey((error, publicKeyResult) => {
                    if (error) {
                        reject(new Error("Error reading public key. " + error));
                        return;
                    }
                    publicKey = publicKeyResult;
                    isSignatureVerificationEnabled = !!publicKey;
                    this.getSignatureFromUpdate(deploymentResult.deployDir, (error, signature) => {
                        if (error) {
                            reject(new Error("Error reading signature from update. " + error));
                            return;
                        }
                        isSignatureAppearedInBundle = !!signature;
                        verify(isSignatureVerificationEnabled, isSignatureAppearedInBundle, publicKey, signature);
                    });
                });
            });
        }
        getPublicKey(callback) {
            var success = (publicKey) => {
                callback(null, publicKey);
            };
            var fail = (error) => {
                callback(error, null);
            };
            CodePush.getPublicKey().then(result => success(result.value || null), fail);
        }
        getSignatureFromUpdate(deployDir, callback) {
            return __awaiter$3(this, void 0, void 0, function* () {
                const filePath = deployDir + "/public/.codepushrelease";
                if (!(yield FileUtil.fileExists(filesystem.Directory.Data, filePath))) {
                    // signature absents in the bundle
                    callback(null, null);
                    return;
                }
                try {
                    const signature = yield FileUtil.readFile(filesystem.Directory.Data, filePath);
                    callback(null, signature);
                }
                catch (error) {
                    // error reading signature file from bundle
                    callback(error, null);
                }
            });
        }
        verifyHash(deployDir, newUpdateHash, errorCallback, successCallback) {
            var packageHashSuccess = (computedHash) => {
                if (computedHash !== newUpdateHash) {
                    errorCallback(new Error("The update contents failed the data integrity check."));
                    return;
                }
                CodePushUtil.logMessage("The update contents succeeded the data integrity check.");
                successCallback();
            };
            var packageHashFail = (error) => {
                errorCallback(new Error("Unable to compute hash for package: " + error));
            };
            CodePushUtil.logMessage("Verifying hash for folder path: " + deployDir);
            CodePush.getPackageHash({ path: deployDir }).then(result => packageHashSuccess(result.value), packageHashFail);
        }
        verifySignature(deployDir, newUpdateHash, publicKey, signature, errorCallback, successCallback) {
            var decodeSignatureSuccess = (contentHash) => {
                if (contentHash !== newUpdateHash) {
                    errorCallback(new Error("The update contents failed the code signing check."));
                    return;
                }
                CodePushUtil.logMessage("The update contents succeeded the code signing check.");
                successCallback();
            };
            var decodeSignatureFail = (error) => {
                errorCallback(new Error("Unable to verify signature for package: " + error));
            };
            CodePushUtil.logMessage("Verifying signature for folder path: " + deployDir);
            CodePush.decodeSignature({ publicKey, signature }).then(result => decodeSignatureSuccess(result.value), decodeSignatureFail);
        }
        finishInstall(deployDir, installOptions, installSuccess, installError) {
            function backupPackageInformationFileIfNeeded(backupIfNeededDone) {
                return __awaiter$3(this, void 0, void 0, function* () {
                    const pendingUpdate = yield NativeAppInfo.isPendingUpdate();
                    if (pendingUpdate) {
                        // Don't back up the  currently installed update since it hasn't been "confirmed"
                        backupIfNeededDone(null, null);
                    }
                    else {
                        try {
                            yield LocalPackage.backupPackageInformationFile();
                            backupIfNeededDone(null, null);
                        }
                        catch (err) {
                            backupIfNeededDone(err, null);
                        }
                    }
                });
            }
            LocalPackage.getCurrentOrDefaultPackage().then((oldPackage) => {
                backupPackageInformationFileIfNeeded((backupError) => {
                    /* continue on error, current package information is missing if this is the first update */
                    this.writeNewPackageMetadata().then(() => {
                        var invokeSuccessAndInstall = () => {
                            CodePushUtil.logMessage("Install succeeded.");
                            var installModeToUse = this.isMandatory ? installOptions.mandatoryInstallMode : installOptions.installMode;
                            if (installModeToUse === exports.InstallMode.IMMEDIATE) {
                                /* invoke success before navigating */
                                installSuccess && installSuccess(installModeToUse);
                                /* no need for callbacks, the javascript context will reload */
                                CodePush.install({
                                    startLocation: deployDir,
                                    installMode: installModeToUse,
                                    minimumBackgroundDuration: installOptions.minimumBackgroundDuration
                                });
                            }
                            else {
                                CodePush.install({
                                    startLocation: deployDir,
                                    installMode: installModeToUse,
                                    minimumBackgroundDuration: installOptions.minimumBackgroundDuration
                                }).then(() => { installSuccess && installSuccess(installModeToUse); }, () => { installError && installError(); });
                            }
                        };
                        var preInstallSuccess = () => {
                            /* package will be cleaned up after success, on the native side */
                            invokeSuccessAndInstall();
                        };
                        var preInstallFailure = (preInstallError) => {
                            CodePushUtil.logError("Preinstall failure.", preInstallError);
                            var error = new Error("An error has occured while installing the package. " + CodePushUtil.getErrorMessage(preInstallError));
                            installError && installError(error);
                        };
                        CodePush.preInstall({ startLocation: deployDir }).then(preInstallSuccess, preInstallFailure);
                    }, (writeMetadataError) => {
                        installError && installError(writeMetadataError);
                    });
                });
            }, installError);
        }
        static handleDeployment(newPackageLocation) {
            return __awaiter$3(this, void 0, void 0, function* () {
                const manifestFile = {
                    directory: filesystem.Directory.Data,
                    path: LocalPackage.DownloadUnzipDir + "/" + LocalPackage.DiffManifestFile
                };
                const isDiffUpdate = yield FileUtil.fileExists(manifestFile.directory, manifestFile.path);
                if (!(yield FileUtil.directoryExists(filesystem.Directory.Data, LocalPackage.VersionsDir))) {
                    // If directory not exists, create recursive folder
                    yield filesystem.Filesystem.mkdir({
                        path: LocalPackage.VersionsDir,
                        directory: filesystem.Directory.Data,
                        recursive: true
                    });
                }
                if (isDiffUpdate) {
                    yield LocalPackage.handleDiffDeployment(newPackageLocation, manifestFile);
                }
                else {
                    yield LocalPackage.handleCleanDeployment(newPackageLocation);
                }
                return { deployDir: newPackageLocation, isDiffUpdate };
            });
        }
        writeNewPackageMetadata() {
            return __awaiter$3(this, void 0, void 0, function* () {
                const timestamp = yield NativeAppInfo.getApplicationBuildTime().catch(buildTimeError => {
                    CodePushUtil.logError("Could not get application build time. " + buildTimeError);
                });
                const appVersion = yield NativeAppInfo.getApplicationVersion().catch(appVersionError => {
                    CodePushUtil.logError("Could not get application version." + appVersionError);
                });
                const currentPackageMetadata = {
                    nativeBuildTime: timestamp,
                    localPath: this.localPath,
                    appVersion: appVersion,
                    deploymentKey: this.deploymentKey,
                    description: this.description,
                    isMandatory: this.isMandatory,
                    packageSize: this.packageSize,
                    label: this.label,
                    packageHash: this.packageHash,
                    isFirstRun: false,
                    failedInstall: false,
                    install: undefined
                };
                return new Promise((resolve, reject) => {
                    LocalPackage.writeCurrentPackageInformation(currentPackageMetadata, error => error ? reject(error) : resolve());
                });
            });
        }
        static handleCleanDeployment(newPackageLocation) {
            return __awaiter$3(this, void 0, void 0, function* () {
                // no diff manifest
                const source = { directory: filesystem.Directory.Data, path: LocalPackage.DownloadUnzipDir };
                const target = { directory: filesystem.Directory.Data, path: newPackageLocation };
                // TODO: create destination directory if it doesn't exist
                return FileUtil.copyDirectoryEntriesTo(source, target);
            });
        }
        static copyCurrentPackage(newPackageLocation, ignoreList) {
            return __awaiter$3(this, void 0, void 0, function* () {
                const currentPackagePath = yield new Promise(resolve => {
                    LocalPackage.getPackage(LocalPackage.PackageInfoFile, (currentPackage) => resolve(currentPackage.localPath), () => resolve());
                });
                newPackageLocation = currentPackagePath ? newPackageLocation : newPackageLocation + "/public";
                // https://github.com/ionic-team/capacitor/pull/2514 Directory.Application variable was removed. (TODO - for check)
                const source = currentPackagePath ? { directory: filesystem.Directory.Data, path: currentPackagePath } : { directory: filesystem.Directory.Data, path: "public" };
                const target = { directory: filesystem.Directory.Data, path: newPackageLocation };
                return FileUtil.copyDirectoryEntriesTo(source, target, ignoreList);
            });
        }
        static handleDiffDeployment(newPackageLocation, diffManifest) {
            return __awaiter$3(this, void 0, void 0, function* () {
                let manifest;
                try {
                    yield LocalPackage.copyCurrentPackage(newPackageLocation, [".codepushrelease"]);
                    yield LocalPackage.handleCleanDeployment(newPackageLocation);
                    /* delete files mentioned in the manifest */
                    const content = yield FileUtil.readFile(diffManifest.directory, diffManifest.path);
                    manifest = JSON.parse(content);
                    yield FileUtil.deleteEntriesFromDataDirectory(newPackageLocation, manifest.deletedFiles);
                }
                catch (error) {
                    throw new Error("Cannot perform diff-update.");
                }
            });
        }
        /**
        * Writes the given local package information to the current package information file.
        * @param packageInfoMetadata The object to serialize.
        * @param callback In case of an error, this function will be called with the error as the fist parameter.
        */
        static writeCurrentPackageInformation(packageInfoMetadata, callback) {
            var content = JSON.stringify(packageInfoMetadata);
            FileUtil.writeStringToDataFile(content, LocalPackage.RootDir + "/" + LocalPackage.PackageInfoFile, true, callback);
        }
        /**
         * Backs up the current package information to the old package information file.
         * This file is used for recovery in case of an update going wrong.
         * @param callback In case of an error, this function will be called with the error as the fist parameter.
         */
        static backupPackageInformationFile() {
            return __awaiter$3(this, void 0, void 0, function* () {
                const source = {
                    directory: filesystem.Directory.Data,
                    path: LocalPackage.RootDir + "/" + LocalPackage.PackageInfoFile
                };
                const destination = {
                    directory: filesystem.Directory.Data,
                    path: LocalPackage.RootDir + "/" + LocalPackage.OldPackageInfoFile
                };
                return FileUtil.copy(source, destination);
            });
        }
        /**
         * Get the previous package information.
         *
         * @param packageSuccess Callback invoked with the old package information.
         * @param packageError Optional callback invoked in case of an error.
         */
        static getOldPackage(packageSuccess, packageError) {
            LocalPackage.getPackage(LocalPackage.OldPackageInfoFile, packageSuccess, packageError);
        }
        /**
         * Reads package information from a given file.
         *
         * @param packageFile The package file name.
         * @param packageSuccess Callback invoked with the package information.
         * @param packageError Optional callback invoked in case of an error.
         */
        static getPackage(packageFile, packageSuccess, packageError) {
            return __awaiter$3(this, void 0, void 0, function* () {
                var handleError = (e) => {
                    packageError && packageError(new Error("Cannot read package information. " + CodePushUtil.getErrorMessage(e)));
                };
                try {
                    const content = yield FileUtil.readDataFile(LocalPackage.RootDir + "/" + packageFile);
                    const packageInfo = JSON.parse(content);
                    LocalPackage.getLocalPackageFromMetadata(packageInfo).then(packageSuccess, packageError);
                }
                catch (e) {
                    handleError(e);
                }
            });
        }
        static getLocalPackageFromMetadata(metadata) {
            return __awaiter$3(this, void 0, void 0, function* () {
                if (!metadata) {
                    throw new Error("Invalid package metadata.");
                }
                const installFailed = yield NativeAppInfo.isFailedUpdate(metadata.packageHash);
                const isFirstRun = yield NativeAppInfo.isFirstRun(metadata.packageHash);
                const localPackage = new LocalPackage();
                localPackage.appVersion = metadata.appVersion;
                localPackage.deploymentKey = metadata.deploymentKey;
                localPackage.description = metadata.description;
                localPackage.isMandatory = metadata.isMandatory;
                localPackage.failedInstall = installFailed;
                localPackage.isFirstRun = isFirstRun;
                localPackage.label = metadata.label;
                localPackage.localPath = metadata.localPath;
                localPackage.packageHash = metadata.packageHash;
                localPackage.packageSize = metadata.packageSize;
                return localPackage;
            });
        }
        static getCurrentOrDefaultPackage() {
            return LocalPackage.getPackageInfoOrDefault(LocalPackage.PackageInfoFile);
        }
        static getOldOrDefaultPackage() {
            return __awaiter$3(this, void 0, void 0, function* () {
                return LocalPackage.getPackageInfoOrDefault(LocalPackage.OldPackageInfoFile);
            });
        }
        static getPackageInfoOrDefault(packageFile) {
            return __awaiter$3(this, void 0, void 0, function* () {
                return new Promise((resolve, reject) => {
                    const packageFailure = () => __awaiter$3(this, void 0, void 0, function* () {
                        /**
                         * For the default package we need the app version,
                         * and ideally the hash of the binary contents.
                         */
                        let appVersion;
                        try {
                            appVersion = yield NativeAppInfo.getApplicationVersion();
                        }
                        catch (appVersionError) {
                            CodePushUtil.logError("Could not get application version." + appVersionError);
                            reject(appVersionError);
                            return;
                        }
                        const defaultPackage = new LocalPackage();
                        defaultPackage.appVersion = appVersion;
                        try {
                            defaultPackage.packageHash = yield NativeAppInfo.getBinaryHash();
                        }
                        catch (binaryHashError) {
                            CodePushUtil.logError("Could not get binary hash." + binaryHashError);
                        }
                        resolve(defaultPackage);
                    });
                    LocalPackage.getPackage(packageFile, resolve, packageFailure);
                });
            });
        }
        static getPackageInfoOrNull(packageFile, packageSuccess, packageError) {
            LocalPackage.getPackage(packageFile, packageSuccess, packageSuccess.bind(null, null));
        }
        /**
         * Returns the default options for the CodePush install operation.
         * If the options are not defined yet, the static DefaultInstallOptions member will be instantiated.
         */
        static getDefaultInstallOptions() {
            if (!LocalPackage.DefaultInstallOptions) {
                LocalPackage.DefaultInstallOptions = {
                    installMode: exports.InstallMode.ON_NEXT_RESTART,
                    minimumBackgroundDuration: 0,
                    mandatoryInstallMode: exports.InstallMode.IMMEDIATE
                };
            }
            return LocalPackage.DefaultInstallOptions;
        }
    }
    LocalPackage.RootDir = "codepush";
    LocalPackage.DownloadDir = LocalPackage.RootDir + "/download";
    LocalPackage.DownloadUnzipDir = LocalPackage.DownloadDir + "/unzipped";
    LocalPackage.DeployDir = LocalPackage.RootDir + "/deploy";
    LocalPackage.VersionsDir = LocalPackage.DeployDir + "/versions";
    LocalPackage.PackageUpdateFileName = "update.zip";
    LocalPackage.PackageInfoFile = "currentPackage.json";
    LocalPackage.OldPackageInfoFile = "oldPackage.json";
    LocalPackage.DiffManifestFile = "hotcodepush.json";

    var __awaiter$4 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
    /**
     * Defines a remote package, which represents an update package available for download.
     */
    class RemotePackage extends Package {
        constructor() {
            super(...arguments);
            this.isDownloading = false;
        }
        /**
         * Downloads the package update from the CodePush service.
         * TODO: implement download progress
         *
         * @param downloadProgress Optional callback invoked during the download process. It is called several times with one DownloadProgress parameter.
         */
        download(downloadProgress) {
            return __awaiter$4(this, void 0, void 0, function* () {
                CodePushUtil.logMessage("Downloading update");
                if (!this.downloadUrl) {
                    CodePushUtil.throwError(new Error("The remote package does not contain a download URL."));
                }
                this.isDownloading = true;
                const file = LocalPackage.DownloadDir + "/" + LocalPackage.PackageUpdateFileName;
                const fullPath = yield FileUtil.getUri(filesystem.Directory.Data, file);
                try {
                    // create directory if not exists
                    if (!(yield FileUtil.directoryExists(filesystem.Directory.Data, LocalPackage.DownloadDir))) {
                        yield filesystem.Filesystem.mkdir({
                            path: LocalPackage.DownloadDir,
                            directory: filesystem.Directory.Data,
                            recursive: true,
                        });
                    }
                    // delete file if it exists
                    if (yield FileUtil.fileExists(filesystem.Directory.Data, file)) {
                        yield filesystem.Filesystem.deleteFile({ directory: filesystem.Directory.Data, path: file });
                    }
                    yield http.Http.downloadFile({
                        url: this.downloadUrl,
                        method: "GET",
                        filePath: file,
                        fileDirectory: filesystem.Directory.Data,
                        responseType: "blob"
                    });
                }
                catch (e) {
                    CodePushUtil.throwError(new Error("An error occured while downloading the package. " + (e && e.message) ? e.message : ""));
                }
                finally {
                    this.isDownloading = false;
                }
                const installFailed = yield NativeAppInfo.isFailedUpdate(this.packageHash);
                const localPackage = new LocalPackage();
                localPackage.deploymentKey = this.deploymentKey;
                localPackage.description = this.description;
                localPackage.label = this.label;
                localPackage.appVersion = this.appVersion;
                localPackage.isMandatory = this.isMandatory;
                localPackage.packageHash = this.packageHash;
                localPackage.isFirstRun = false;
                localPackage.failedInstall = installFailed;
                localPackage.localPath = fullPath;
                CodePushUtil.logMessage("Package download success: " + JSON.stringify(localPackage));
                Sdk.reportStatusDownload(localPackage, localPackage.deploymentKey);
                return localPackage;
            });
        }
        /**
         * Aborts the current download session, previously started with download().
         */
        abortDownload() {
            return __awaiter$4(this, void 0, void 0, function* () {
                // TODO: implement download abort
                return new Promise((resolve) => {
                    this.isDownloading = false;
                    resolve();
                });
            });
        }
    }

    /**
     * Defines the possible result and intermediate statuses of the window.codePush.sync operation.
     * The result statuses are final, mutually exclusive statuses of the sync operation. The operation will end with only one of the possible result statuses.
     * The intermediate statuses are not final, one or more of them can happen before sync ends, based on the options you use and user interaction.
     *
     * NOTE: Adding new statuses or changing old statuses requires an update to CodePush.sync(), which must know which callbacks are results and which are not!
     *       Also, don't forget to change the TestMessage module in ServerUtils!
     *       AND THE codePush.d.ts (typings) file!!!
     */
    exports.SyncStatus = void 0;
    (function (SyncStatus) {
        /**
         * Result status - the application is up to date.
         */
        SyncStatus[SyncStatus["UP_TO_DATE"] = 0] = "UP_TO_DATE";
        /**
         * Result status - an update is available, it has been downloaded, unzipped and copied to the deployment folder.
         * After the completion of the callback invoked with SyncStatus.UPDATE_INSTALLED, the application will be reloaded with the updated code and resources.
         */
        SyncStatus[SyncStatus["UPDATE_INSTALLED"] = 1] = "UPDATE_INSTALLED";
        /**
         * Result status - an optional update is available, but the user declined to install it. The update was not downloaded.
         */
        SyncStatus[SyncStatus["UPDATE_IGNORED"] = 2] = "UPDATE_IGNORED";
        /**
         * Result status - an error happened during the sync operation. This might be an error while communicating with the server, downloading or unziping the update.
         * The console logs should contain more information about what happened. No update has been applied in this case.
         */
        SyncStatus[SyncStatus["ERROR"] = 3] = "ERROR";
        /**
         * Result status - there is an ongoing sync in progress, so this attempt to sync has been aborted.
         */
        SyncStatus[SyncStatus["IN_PROGRESS"] = 4] = "IN_PROGRESS";
        /**
         * Intermediate status - the plugin is about to check for updates.
         */
        SyncStatus[SyncStatus["CHECKING_FOR_UPDATE"] = 5] = "CHECKING_FOR_UPDATE";
        /**
         * Intermediate status - a user dialog is about to be displayed. This status will be reported only if user interaction is enabled.
         */
        SyncStatus[SyncStatus["AWAITING_USER_ACTION"] = 6] = "AWAITING_USER_ACTION";
        /**
         * Intermediate status - the update packages is about to be downloaded.
         */
        SyncStatus[SyncStatus["DOWNLOADING_PACKAGE"] = 7] = "DOWNLOADING_PACKAGE";
        /**
         * Intermediate status - the update package is about to be installed.
         */
        SyncStatus[SyncStatus["INSTALLING_UPDATE"] = 8] = "INSTALLING_UPDATE";
    })(exports.SyncStatus || (exports.SyncStatus = {}));

    var __awaiter$5 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
    /**
     * This is the entry point to Cordova CodePush SDK.
     * It provides the following features to the app developer:
     * - polling the server for new versions of the app
     * - notifying the plugin that the application loaded successfully after an update
     * - getting information about the currently deployed package
     */
    class CodePush$1 {
        /**
         * Notifies the plugin that the update operation succeeded and that the application is ready.
         * Calling this function is required on the first run after an update. On every subsequent application run, calling this function is a noop.
         * If using sync API, calling this function is not required since sync calls it internally.
         */
        notifyApplicationReady() {
            return CodePush.notifyApplicationReady();
        }
        /**
         * Reloads the application. If there is a pending update package installed using ON_NEXT_RESTART or ON_NEXT_RESUME modes, the update
         * will be immediately visible to the user. Otherwise, calling this function will simply reload the current version of the application.
         */
        restartApplication() {
            return CodePush.restartApplication();
        }
        /**
         * Reports an application status back to the server.
         * !!! This function is called from the native side, please make changes accordingly. !!!
         */
        reportStatus(status, label, appVersion, deploymentKey, lastVersionLabelOrAppVersion, lastVersionDeploymentKey) {
            if (((!label && appVersion === lastVersionLabelOrAppVersion) || label === lastVersionLabelOrAppVersion)
                && deploymentKey === lastVersionDeploymentKey) {
                // No-op since the new appVersion and label is exactly the same as the previous
                // (the app might have been updated via a direct or HockeyApp deployment).
                return;
            }
            var createPackageForReporting = (label, appVersion) => {
                return {
                    /* The SDK only reports the label and appVersion.
                       The rest of the properties are added for type safety. */
                    label, appVersion, deploymentKey,
                    description: null, isMandatory: false,
                    packageHash: null, packageSize: null,
                    failedInstall: false
                };
            };
            var reportDone = (error) => {
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
                    CodePush.reportFailed({ statusReport: reportArgs });
                }
                else {
                    CodePushUtil.logMessage(`Reported status: ${JSON.stringify(reportArgs)}`);
                    CodePush.reportSucceeded({ statusReport: reportArgs });
                }
            };
            switch (status) {
                case ReportStatus.STORE_VERSION:
                    Sdk.reportStatusDeploy(null, acquisitionSdk.AcquisitionStatus.DeploymentSucceeded, deploymentKey, lastVersionLabelOrAppVersion, lastVersionDeploymentKey, reportDone);
                    break;
                case ReportStatus.UPDATE_CONFIRMED:
                    Sdk.reportStatusDeploy(createPackageForReporting(label, appVersion), acquisitionSdk.AcquisitionStatus.DeploymentSucceeded, deploymentKey, lastVersionLabelOrAppVersion, lastVersionDeploymentKey, reportDone);
                    break;
                case ReportStatus.UPDATE_ROLLED_BACK:
                    Sdk.reportStatusDeploy(createPackageForReporting(label, appVersion), acquisitionSdk.AcquisitionStatus.DeploymentFailed, deploymentKey, lastVersionLabelOrAppVersion, lastVersionDeploymentKey, reportDone);
                    break;
            }
        }
        /**
         * Get the current package information.
         *
         * @returns The currently deployed package information.
         */
        getCurrentPackage() {
            return __awaiter$5(this, void 0, void 0, function* () {
                const pendingUpdate = yield NativeAppInfo.isPendingUpdate();
                var packageInfoFile = pendingUpdate ? LocalPackage.OldPackageInfoFile : LocalPackage.PackageInfoFile;
                return new Promise((resolve, reject) => {
                    LocalPackage.getPackageInfoOrNull(packageInfoFile, resolve, reject);
                });
            });
        }
        /**
         * Gets the pending package information, if any. A pending package is one that has been installed but the application still runs the old code.
         * This happens only after a package has been installed using ON_NEXT_RESTART or ON_NEXT_RESUME mode, but the application was not restarted/resumed yet.
         */
        getPendingPackage() {
            return __awaiter$5(this, void 0, void 0, function* () {
                const pendingUpdate = yield NativeAppInfo.isPendingUpdate();
                if (!pendingUpdate)
                    return null;
                return new Promise((resolve, reject) => {
                    LocalPackage.getPackageInfoOrNull(LocalPackage.PackageInfoFile, resolve, reject);
                });
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
        checkForUpdate(querySuccess, queryError, deploymentKey) {
            try {
                const callback = (error, remotePackageOrUpdateNotification) => __awaiter$5(this, void 0, void 0, function* () {
                    if (error) {
                        CodePushUtil.invokeErrorCallback(error, queryError);
                    }
                    else {
                        const appUpToDate = () => {
                            CodePushUtil.logMessage("App is up to date.");
                            querySuccess && querySuccess(null);
                        };
                        if (remotePackageOrUpdateNotification) {
                            if (remotePackageOrUpdateNotification.updateAppVersion) {
                                /* There is an update available for a different version. In the current version of the plugin, we treat that as no update. */
                                CodePushUtil.logMessage("An update is available, but it is targeting a newer binary version than you are currently running.");
                                appUpToDate();
                            }
                            else {
                                /* There is an update available for the current version. */
                                var remotePackage = remotePackageOrUpdateNotification;
                                const installFailed = yield NativeAppInfo.isFailedUpdate(remotePackage.packageHash);
                                var result = new RemotePackage();
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
                        }
                        else {
                            appUpToDate();
                        }
                    }
                });
                const queryUpdate = () => __awaiter$5(this, void 0, void 0, function* () {
                    try {
                        const acquisitionManager = yield Sdk.getAcquisitionManager(deploymentKey);
                        const localPackage = yield LocalPackage.getCurrentOrDefaultPackage();
                        try {
                            const currentBinaryVersion = yield NativeAppInfo.getApplicationVersion();
                            localPackage.appVersion = currentBinaryVersion;
                        }
                        catch (e) {
                            /* Nothing to do */
                            /* TODO : Why ? */
                        }
                        CodePushUtil.logMessage("Checking for update.");
                        acquisitionManager.queryUpdateWithCurrentPackage(localPackage, callback);
                    }
                    catch (e) {
                        CodePushUtil.invokeErrorCallback(e, queryError);
                    }
                });
                if (deploymentKey) {
                    queryUpdate();
                }
                else {
                    NativeAppInfo.getDeploymentKey()
                        .then((defaultDeploymentKey) => {
                        deploymentKey = defaultDeploymentKey;
                        queryUpdate();
                    }, (deploymentKeyError) => {
                        CodePushUtil.invokeErrorCallback(deploymentKeyError, queryError);
                    });
                }
            }
            catch (e) {
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
        sync(syncOptions, downloadProgress) {
            return __awaiter$5(this, void 0, void 0, function* () {
                return yield new Promise((resolve, reject) => {
                    /* Check if a sync is already in progress */
                    if (CodePush$1.SyncInProgress) {
                        /* A sync is already in progress */
                        CodePushUtil.logMessage("Sync already in progress.");
                        resolve(exports.SyncStatus.IN_PROGRESS);
                    }
                    /* Create a callback that resets the SyncInProgress flag when the sync is complete
                    * If the sync status is a result status, then the sync must be complete and the flag must be updated
                    * Otherwise, do not change the flag and trigger the syncCallback as usual
                    */
                    const syncCallbackAndUpdateSyncInProgress = (err, result) => {
                        if (err) {
                            syncOptions.onSyncError && syncOptions.onSyncError(err);
                            CodePush$1.SyncInProgress = false;
                            reject(err);
                        }
                        else {
                            /* Call the user's callback */
                            syncOptions.onSyncStatusChanged && syncOptions.onSyncStatusChanged(result);
                            /* Check if the sync operation is over */
                            switch (result) {
                                case exports.SyncStatus.ERROR:
                                case exports.SyncStatus.UP_TO_DATE:
                                case exports.SyncStatus.UPDATE_IGNORED:
                                case exports.SyncStatus.UPDATE_INSTALLED:
                                    /* The sync has completed */
                                    CodePush$1.SyncInProgress = false;
                                    resolve(result);
                                    break;
                            }
                        }
                    };
                    /* Begin the sync */
                    CodePush$1.SyncInProgress = true;
                    this.syncInternal(syncCallbackAndUpdateSyncInProgress, syncOptions, downloadProgress);
                });
            });
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
        syncInternal(syncCallback, syncOptions, downloadProgress) {
            /* No options were specified, use default */
            const defaultSyncOptions = this.getDefaultSyncOptions();
            if (!syncOptions) {
                syncOptions = defaultSyncOptions;
            }
            else {
                /* Some options were specified */
                /* Handle dialog options */
                const defaultDialogOptions = this.getDefaultUpdateDialogOptions();
                if (syncOptions.updateDialog) {
                    if (typeof syncOptions.updateDialog !== typeof ({})) {
                        /* updateDialog set to true condition, use default options */
                        syncOptions.updateDialog = defaultDialogOptions;
                    }
                    else {
                        /* some options were specified, merge with default */
                        CodePushUtil.copyUnassignedMembers(defaultDialogOptions, syncOptions.updateDialog);
                    }
                }
                /* Handle other options. Dialog options will not be overwritten. */
                CodePushUtil.copyUnassignedMembers(defaultSyncOptions, syncOptions);
            }
            this.notifyApplicationReady();
            const onError = (error) => {
                CodePushUtil.logError("An error occurred during sync.", error);
                syncCallback && syncCallback(error, exports.SyncStatus.ERROR);
            };
            const onInstallSuccess = (appliedWhen) => {
                switch (appliedWhen) {
                    case exports.InstallMode.ON_NEXT_RESTART:
                        CodePushUtil.logMessage("Update is installed and will be run on the next app restart.");
                        break;
                    case exports.InstallMode.ON_NEXT_RESUME:
                        if (syncOptions.minimumBackgroundDuration > 0) {
                            CodePushUtil.logMessage(`Update is installed and will be run after the app has been in the background for at least ${syncOptions.minimumBackgroundDuration} seconds.`);
                        }
                        else {
                            CodePushUtil.logMessage("Update is installed and will be run when the app next resumes.");
                        }
                        break;
                }
                syncCallback && syncCallback(null, exports.SyncStatus.UPDATE_INSTALLED);
            };
            const onDownloadSuccess = (localPackage) => {
                syncCallback && syncCallback(null, exports.SyncStatus.INSTALLING_UPDATE);
                localPackage.install(syncOptions).then(onInstallSuccess, onError);
            };
            const downloadAndInstallUpdate = (remotePackage) => {
                syncCallback && syncCallback(null, exports.SyncStatus.DOWNLOADING_PACKAGE);
                remotePackage.download(downloadProgress).then(onDownloadSuccess, onError);
            };
            const onUpdate = (remotePackage) => __awaiter$5(this, void 0, void 0, function* () {
                if (remotePackage === null) {
                    /* Then the app is up to date */
                    syncCallback && syncCallback(null, exports.SyncStatus.UP_TO_DATE);
                }
                else {
                    if (remotePackage.failedInstall && syncOptions.ignoreFailedUpdates) {
                        CodePushUtil.logMessage("An update is available, but it is being ignored due to have been previously rolled back.");
                        syncCallback && syncCallback(null, exports.SyncStatus.UPDATE_IGNORED);
                    }
                    else {
                        if (syncOptions.updateDialog) {
                            CodePushUtil.logMessage("Awaiting user action.");
                            syncCallback && syncCallback(null, exports.SyncStatus.AWAITING_USER_ACTION);
                            const dlgOpts = syncOptions.updateDialog;
                            if (remotePackage.isMandatory) {
                                /* Alert user */
                                const message = dlgOpts.appendReleaseDescription ?
                                    dlgOpts.mandatoryUpdateMessage + dlgOpts.descriptionPrefix + remotePackage.description :
                                    dlgOpts.mandatoryUpdateMessage;
                                yield dialog.Dialog.alert({
                                    message,
                                    title: dlgOpts.updateTitle,
                                    buttonTitle: dlgOpts.mandatoryContinueButtonLabel
                                });
                                downloadAndInstallUpdate(remotePackage);
                            }
                            else {
                                /* Confirm update with user */
                                const message = dlgOpts.appendReleaseDescription ?
                                    dlgOpts.optionalUpdateMessage + dlgOpts.descriptionPrefix + remotePackage.description
                                    : dlgOpts.optionalUpdateMessage;
                                const confirmResult = yield dialog.Dialog.confirm({
                                    message,
                                    title: dlgOpts.updateTitle,
                                    okButtonTitle: dlgOpts.optionalInstallButtonLabel,
                                    cancelButtonTitle: dlgOpts.optionalIgnoreButtonLabel
                                });
                                if (confirmResult.value === true) {
                                    /* Install */
                                    downloadAndInstallUpdate(remotePackage);
                                }
                                else {
                                    /* Cancel */
                                    CodePushUtil.logMessage("User cancelled the update.");
                                    syncCallback && syncCallback(null, exports.SyncStatus.UPDATE_IGNORED);
                                }
                            }
                        }
                        else {
                            /* No user interaction */
                            downloadAndInstallUpdate(remotePackage);
                        }
                    }
                }
            });
            syncCallback && syncCallback(null, exports.SyncStatus.CHECKING_FOR_UPDATE);
            this.checkForUpdate(onUpdate, onError, syncOptions.deploymentKey);
        }
        /**
         * Returns the default options for the CodePush sync operation.
         * If the options are not defined yet, the static DefaultSyncOptions member will be instantiated.
         */
        getDefaultSyncOptions() {
            if (!CodePush$1.DefaultSyncOptions) {
                CodePush$1.DefaultSyncOptions = {
                    ignoreFailedUpdates: true,
                    installMode: exports.InstallMode.ON_NEXT_RESTART,
                    minimumBackgroundDuration: 0,
                    mandatoryInstallMode: exports.InstallMode.IMMEDIATE,
                    updateDialog: false,
                    deploymentKey: undefined
                };
            }
            return CodePush$1.DefaultSyncOptions;
        }
        /**
         * Returns the default options for the update dialog.
         * Please note that the dialog is disabled by default.
         */
        getDefaultUpdateDialogOptions() {
            if (!CodePush$1.DefaultUpdateDialogOptions) {
                CodePush$1.DefaultUpdateDialogOptions = {
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
            return CodePush$1.DefaultUpdateDialogOptions;
        }
    }
    /**
     * Defines the application statuses reported from the native layer.
     * !!! This enum is defined in native code as well, please make changes accordingly. !!!
     */
    var ReportStatus;
    (function (ReportStatus) {
        ReportStatus[ReportStatus["STORE_VERSION"] = 0] = "STORE_VERSION";
        ReportStatus[ReportStatus["UPDATE_CONFIRMED"] = 1] = "UPDATE_CONFIRMED";
        ReportStatus[ReportStatus["UPDATE_ROLLED_BACK"] = 2] = "UPDATE_ROLLED_BACK";
    })(ReportStatus || (ReportStatus = {}));
    const codePush = new CodePush$1();
    window.codePush = codePush;

    exports.CodePush = CodePush;
    exports.codePush = codePush;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

}({}, acquisitionSdk, filesystem, capacitorExports, http, device, dialog));
//# sourceMappingURL=plugin.js.map
