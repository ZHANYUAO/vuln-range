"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../../../services/jobs-service/job");
class ContentImportJob extends job_1.Job {
    static type = 'site-content-import';
    uploadKey;
    fileName;
    emailRecipient;
    importTag;
    returnImportedData;
    importPersistUser;
    constructor(data) {
        super();
        this.uploadKey = data.uploadKey;
        this.fileName = data.fileName;
        this.emailRecipient = data.emailRecipient;
        this.importTag = data.importTag;
        this.returnImportedData = data.returnImportedData;
        this.importPersistUser = data.importPersistUser;
    }
}
exports.default = ContentImportJob;
