import { CloudantV1 } from '@ibm-cloud/cloudant';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';

let cloudantClient: CloudantV1 | null = null;

export function getCloudantClient(): CloudantV1 {
  if (cloudantClient) {
    return cloudantClient;
  }

  const apikey = process.env.CLOUDANT_APIKEY;
  const url = process.env.CLOUDANT_URL;

  if (!apikey || !url) {
    throw new Error('Missing Cloudant credentials in environment variables');
  }

  const authenticator = new IamAuthenticator({ apikey });
  cloudantClient = new CloudantV1({ authenticator });
  cloudantClient.setServiceUrl(url);

  return cloudantClient;
}

export function getDatabaseName(): string {
  return process.env.CLOUDANT_DATABASE || 'sensor-data';
}

