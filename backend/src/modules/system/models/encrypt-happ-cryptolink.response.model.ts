export class EncryptHappCryptoLinkResponseModel {
    encryptedLink: string;

    constructor(data: string) {
        this.encryptedLink = data;
    }
}
