/* Provide simple data protection routines. Currently this includes:
 *   - Encrypt/Decrypt sensitive data
 *   - Create an HMAC per Amazon standards
*/

// Note that this is correct and crypto should *not* be listed in our deps.
// See https://github.com/meteor/meteor/issues/2050 for details
var crypto = Npm.require('crypto');

(function () { //Begin IIFE pattern

    // Parameters
    var algo = "aes256";

    encryptUserData = function(data) {
        var key = getConfigProperty("protectionKey");
        var cipher = crypto.createCipher(algo, key);
        return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
    };

    decryptUserData = function(data) {
        var key = getConfigProperty("protectionKey");
        var decipher = crypto.createDecipher(algo, key);
        return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
    };

    createAwsHmac = function(secretKey, dataString) {
        return crypto
            .createHmac('sha1', secretKey)
            .update(dataString)
            .digest('base64');
    };
})(); //end IIFE