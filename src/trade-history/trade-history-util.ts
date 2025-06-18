import mongoose, { Schema, Document, Model } from 'mongoose';

interface ISwapDetail {
  routerType: string;
  routerAddress: string;
  permit2Address: string;
  tokenIn: string;
  tokenOut: string;
  fee: string;
}

interface IArbitrageResult extends Document {
  isProfitable: boolean;
  repayAmount: string;
  initialAmount: string;
  finalAmount: string;
  netProfit: string;
  readableNetProfit: string;
  profitRate: string;
  path: string[];
  swapPath: ISwapDetail[];
  actualIsProfitable?: boolean;
  actualFinalAmount?: string;
  actualNetProfit?: string;
  actualProfitRate?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose Schema
const swapDetailSchema = new Schema<ISwapDetail>({
  routerType: { type: String, required: true },
  routerAddress: { type: String, required: true },
  permit2Address: { type: String, required: true },
  tokenIn: { type: String, required: true },
  tokenOut: { type: String, required: true },
  fee: { type: String, required: true }, // Store BigInt as string
});

const arbitrageResultSchema = new Schema<IArbitrageResult>(
  {
    isProfitable: { type: Boolean, required: true },
    repayAmount: { type: String, required: true },
    initialAmount: { type: String, required: true },
    finalAmount: { type: String, required: true },
    netProfit: { type: String, required: true },
    readableNetProfit: { type: String, required: true },
    profitRate: { type: String, required: true },
    path: { type: [String], required: true },
    swapPath: { type: [swapDetailSchema], required: true },
    actualIsProfitable: { type: Boolean, default: null }, // actual result
    actualFinalAmount: { type: String, default: null }, // actual finalAmount
    actualNetProfit: { type: String, default: null }, // actual netProfit
    actualProfitRate: { type: String, default: null }, // actual profit rate
  },
  { timestamps: true }, // Automatically adds createdAt and updatedAt
);

// Mongoose Model
const ArbitrageResultModel = mongoose.model<IArbitrageResult>(
  'ArbitrageResult',
  arbitrageResultSchema,
);

export class TradeHistoryUtil {
  static async connectToMongoDB(uri: string): Promise<void> {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 10,
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
        // Check if connected
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
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not established');
    }
    const convertedData = this.convertBigIntToString(arbitrageResult);
    const tradeHistory = new ArbitrageResultModel(convertedData);
    return await tradeHistory.save();
  }

  static async updateTradeHistory(
    tradeId: string,
    actualResults: {
      actualIsProfitable: boolean;
      actualFinalAmount: bigint;
      actualNetProfit: bigint;
      actualProfitRate: string;
    },
  ): Promise<IArbitrageResult | null> {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not established');
    }
    const convertedActualResults = this.convertBigIntToString(actualResults);
    return await ArbitrageResultModel.findByIdAndUpdate(
      tradeId,
      { $set: convertedActualResults },
      { new: true },
    );
  }

  static async getTradeHistory(
    tradeId: string,
  ): Promise<IArbitrageResult | null> {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not established');
    }
    return await ArbitrageResultModel.findById(tradeId);
  }
}

export default TradeHistoryUtil;
