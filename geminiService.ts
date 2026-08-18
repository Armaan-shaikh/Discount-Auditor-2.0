
import { GoogleGenAI, Type } from "@google/genai";
import { AuditReport } from "./types";

export const getForensicSummary = async (auditData: Partial<AuditReport>) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    As a Senior Forensic Retail Auditor, analyze the following audit findings and provide:
    1. An Executive Summary focusing on revenue leakage and discount integrity.
    2. A structured "Action List" for management.

    AUDIT DATA:
    - Total Transactions: ${auditData.totalTransactions}
    - System-wide Avg Discount: ${auditData.overallAvgDiscount?.toFixed(2)}%
    - High Discount (>=10%) Count: ${auditData.highDiscountBills?.length}
    - Extreme (75-99%) Count: ${auditData.extremeDiscountBills?.length}
    - Complimentary (100%) Count: ${auditData.compBills?.length}
    - Suspicious Loyalty Accounts Found: ${auditData.suspiciousLoyalty?.length}
    - Problematic Stores: ${auditData.storeBenchmarking?.filter(s => s.category === 'High').map(s => s.storeName).join(', ')}

    Identify patterns of "Staff Point Loading" if suspicious loyalty accounts are high.
    Highlight stores providing high discounts with poor or empty remarks.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            actionList: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["executiveSummary", "actionList"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return result;
  } catch (error) {
    console.error("Forensic Summary Error:", error);
    return {
      executiveSummary: "Error generating forensic summary. Please review raw data below.",
      actionList: ["Audit API currently unavailable. Review flags manually."]
    };
  }
};
