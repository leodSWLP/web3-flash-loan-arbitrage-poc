import axios, { AxiosResponse } from 'axios';

export class GetAbiResponse {
  message: string;
  result: string;
  status: string;
}

export class ContractAbiUtil {
  static async queryContractAbi(address: string) {
    const apiKey = process.env.BSC_SCAN_API_KEY;
    if (!apiKey) {
      throw new Error('queryContractAbi(): missing api key');
    }
    const uri = `https://api.bscscan.com/api?module=contract&action=getabi&address=${address}&apikey=${apiKey}`;

    try {
      const response: AxiosResponse<GetAbiResponse> = await axios.get(uri);
      if (response?.data?.message !== 'OK') {
        throw new Error('queryContractAbi(): response message NOT OK');
      }
      return response.data.result;
    } catch (error) {
      throw new Error(
        `API call failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
