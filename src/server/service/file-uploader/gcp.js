const logger = require('@alias/logger')('growi:service:fileUploaderAws');

const urljoin = require('url-join');
const { Storage } = require('@google-cloud/storage');


module.exports = function(crowi) {
  const Uploader = require('./uploader');
  const { configManager } = crowi;
  const lib = new Uploader(configManager);

  function getGcsBucket() {
    return process.env.GCS_BUCKET;
  }

  function GCSFactory(isUploadable) {

    if (!isUploadable) {
      throw new Error('GCP is not configured.');
    }

    return new Storage();
  }

  function getFilePathOnStorage(attachment) {
    if (attachment.filePath != null) { // backward compatibility for v3.3.x or below
      return attachment.filePath;
    }

    const dirName = (attachment.page != null)
      ? 'attachment'
      : 'user';
    const filePath = urljoin(dirName, attachment.fileName);

    return filePath;
  }

  lib.deleteFile = async function(attachment) {
    const filePath = getFilePathOnStorage(attachment);
    return lib.deleteFileByFilePath(filePath);
  };

  lib.deleteFileByFilePath = async function(filePath) {
    const s3 = GCSFactory(this.getIsUploadable());
    const awsConfig = getGcsConfig();

    const params = {
      Bucket: awsConfig.bucket,
      Key: filePath,
    };

    // TODO: ensure not to throw error even when the file does not exist

    return s3.deleteObject(params).promise();
  };

  lib.uploadFile = function(fileStream, attachment) {
    logger.debug(`File uploading: fileName=${attachment.fileName}`);

    const gcs = GCSFactory(this.getIsUploadable());
    const myBucket = gcs.bucket(getGcsBucket());

    return myBucket.upload(fileStream.path);
  };

  /**
   * Find data substance
   *
   * @param {Attachment} attachment
   * @return {stream.Readable} readable stream
   */
  lib.findDeliveryFile = async function(attachment) {
    const s3 = GCSFactory(this.getIsUploadable());
    const awsConfig = getGcsConfig();
    const filePath = getFilePathOnStorage(attachment);

    let stream;
    try {
      const params = {
        Bucket: awsConfig.bucket,
        Key: filePath,
      };
      stream = s3.getObject(params).createReadStream();
    }
    catch (err) {
      logger.error(err);
      throw new Error(`Coudn't get file from AWS for the Attachment (${attachment._id.toString()})`);
    }

    // return stream.Readable
    return stream;
  };

  /**
   * check the file size limit
   *
   * In detail, the followings are checked.
   * - per-file size limit (specified by MAX_FILE_SIZE)
   */
  lib.checkLimit = async(uploadFileSize) => {
    const maxFileSize = crowi.configManager.getConfig('crowi', 'app:maxFileSize');
    return { isUploadable: uploadFileSize <= maxFileSize, errorMessage: 'File size exceeds the size limit per file' };
  };

  return lib;
};
