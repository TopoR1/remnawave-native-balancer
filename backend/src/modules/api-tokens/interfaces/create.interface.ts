export interface ICreateApiTokenRequest {
    tokenName: string;
}

export interface ICreateApiTokenResponse {
    token: string;
    uuid: string;
}
