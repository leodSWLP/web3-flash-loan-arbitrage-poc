import mongoose, { Schema, Document, Model } from 'mongoose';
import { ConfigUtil } from '../config/config.util';

export interface ISwapDetail {
  routerAddress: string;
  permit2Address: string;
  tokenIn: string;
  tokenOut: string;
  fee: number;
}

export interface ITradeMeta {
  blockNumber: number;
  isProfitable: boolean;
  finalAmount: string;
  readableNetProfit: string;
  profitRate: string;
}

export interface IArbitrageResult extends Document {
  routingSymbol: string;
  initialAmount: string;
  repayAmount: string;
  tradePrediction: ITradeMeta;
  quotePath: any[];
  swapPath: ISwapDetail[];
  isTradeExecuted: boolean;
  transactionHash?: string;
  actualTradeResult?: ITradeMeta;
  gasPrice?: string;
  gasUsed?: string;
  error?: any;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose Schema
const swapDetailSchema = new Schema<ISwapDetail>(
  {
    routerAddress: { type: String, required: true },
    permit2Address: { type: String, required: true },
    tokenIn: { type: String, required: true },
    tokenOut: { type: String, required: true },
    fee: { type: Number, required: true },
  },
  { _id: false },
);

const tradeMetaSchema = new Schema<ITradeMeta>(
  {
    blockNumber: { type: Number, required: true },
    isProfitable: { type: Boolean, required: true },
    finalAmount: { type: String, required: true },
    readableNetProfit: { type: String, required: true },
    profitRate: { type: String, required: true },
  },
  { _id: false },
);

const arbitrageResultSchema = new Schema<IArbitrageResult>(
  {
    routingSymbol: { type: String, required: true, indexes: true },
    initialAmount: { type: String, required: true },
    repayAmount: { type: String, required: true },
    tradePrediction: { type: tradeMetaSchema, required: true },
    quotePath: { type: [Object], required: true },
    isTradeExecuted: { type: Boolean, default: false },
    transactionHash: {
      type: String,
      required: false,
      default: null,
      indexes: true,
    },
    actualTradeResult: { type: tradeMetaSchema, default: null },
    gasPrice: { type: String, default: null },
    gasUsed: { type: String, default: null },
    error: { type: Object, default: null },
    swapPath: { type: [swapDetailSchema], required: true },
  },
  { timestamps: true }, // Automatically adds createdAt and updatedAt
);

// Mongoose Model
const ArbitrageResultModel = mongoose.model<IArbitrageResult>(
  'ArbitrageResult',
  arbitrageResultSchema,
);

export class TradeHistoryUtil {
  static async connectToMongoDB(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ConfigUtil.getConfig().MONGO_URI, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 10,
          dbName: 'trades',
        });
        console.log('Connected to MongoDB');
      }
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  static async disconnectFromMongoDB(): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
      }
    } catch (error) {
      console.error('MongoDB disconnection error:', error);
      throw error;
    }
  }

  private static convertBigIntToString(data: any): any {
    if (typeof data === 'bigint') {
      return data.toString();
    } else if (Array.isArray(data)) {
      return data.map((item) => this.convertBigIntToString(item));
    } else if (typeof data === 'object' && data !== null) {
      const result: any = {};
      for (const key in data) {
        result[key] = this.convertBigIntToString(data[key]);
      }
      return result;
    }
    return data;
  }

  static async createTradeHistory(
    arbitrageResult: Partial<IArbitrageResult>,
  ): Promise<IArbitrageResult> {
    await this.connectToMongoDB();
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not established');
    }
    const convertedData = this.convertBigIntToString(arbitrageResult);
    const tradeHistory = new ArbitrageResultModel(convertedData);
    return await tradeHistory.save();
  }

  static async updateTradeHistory(
    tradeId: string,
    arbitrageResult: Partial<IArbitrageResult>,
  ): Promise<IArbitrageResult | null> {
    await this.connectToMongoDB();
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not established');
    }
    const convertedActualResults = this.convertBigIntToString(arbitrageResult);
    return await ArbitrageResultModel.findByIdAndUpdate(
      tradeId,
      convertedActualResults,
    );
  }

  static async getTradeHistory(
    tradeId: string,
  ): Promise<IArbitrageResult | null> {
    await this.connectToMongoDB();
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not established');
    }
    return await ArbitrageResultModel.findById(tradeId);
  }
}

export default TradeHistoryUtil;
