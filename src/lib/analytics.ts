// Analytics Service Integration for Art Bank
// Provides KDE-based FPC calculation, anomaly detection, and risk assessment

export interface AnalyticsServiceClient {
  calculateFPC(assetId: string, historicalPrices: any[]): Promise<any>;
  validateTransaction(data: any): Promise<any>;
  assessLiquidityRisk(data: any): Promise<any>;
}

export class AnalyticsService implements AnalyticsServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  async calculateFPC(assetId: string, historicalPrices: any[]): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/analytics/fpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_id: assetId,
        historical_prices: historicalPrices,
        context: {}
      })
    });

    if (!response.ok) {
      throw new Error(`Analytics Service error: ${response.statusText}`);
    }

    return await response.json();
  }

  async validateTransaction(data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/analytics/validate-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Analytics Service error: ${response.statusText}`);
    }

    return await response.json();
  }

  async assessLiquidityRisk(data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/analytics/liquidity-risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Analytics Service error: ${response.statusText}`);
    }

    return await response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/analytics/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
