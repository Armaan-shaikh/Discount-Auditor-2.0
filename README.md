# Forensic Discount Auditor - Backend Technical Documentation & Agent Architecture

This document outlines the technical architecture, data processing pipeline, analytical logic, and AI agent execution flow for the **Forensic Discount Auditor** system. It is designed for software engineers, data architects, and security/audit systems specialists.

---

## 1. System Objective

The **Forensic Discount Auditor** is an automated analytical and artificial intelligence agent designed to inspect high-volume retail Point of Sale (POS) and Enterprise Resource Planning (ERP) transaction logs to detect revenue leakage, discount manipulation, cashier collusion, and loyalty program fraud.

### Core Technical Problems Solved
- **Unregulated Manual Discount Leakage**: Segregates and benchmarks high-risk discount bands (10% to 100% complimentary) while isolating authorized staff discounts to eliminate overlap.
- **Loyalty Program Exploitation ("Staff Point Loading")**: Detects cashier proxy behaviors where staff scan their personal phone numbers or loyalty identifiers on guest orders to illicitly accumulate and cash out loyalty points.
- **Cross-Store Variance & Anomaly Detection**: Benchmarks individual retail outlets against system-wide discount averages using dynamic statistical thresholds.
- **Automated Forensic Synthesis**: Bridges deterministic numerical analysis with generative AI reasoning (via Google Gemini) to produce structured executive summaries and prioritized remediation action lists.

---

## 2. Architecture & Integrations (Tools & APIs)

```
+-----------------------------------------------------------------------------------+
|                                INGESTION ENGINE                                   |
|  - Raw Excel (.xlsx/.xls) Binary ArrayBuffer                                      |
|  - SheetJS (xlsx v0.18.5) Ingestion & Dynamic Header Fuzzy Normalization          |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                         CORE DATA PROCESSING PIPELINE                             |
|  - Data Cleansing, Epsilon Precision Rounding & Discount Disambiguation           |
|  - Staff vs. Non-Staff Classification Heuristic                                  |
|  - Multi-Tier Discount Partitioning (High: 10-25%, Extreme: 25-90%, Comp: >=90%)   |
|  - Adaptive Temporal Windowing & Loyalty Fraud Matrix Scoring                     |
|  - Store Statistical Benchmark & Outlier Categorization                           |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                         GEMINI AI AGENT INVOCATION                                |
|  - Target Model: gemini-3-flash-preview (via @google/genai SDK v1.34.0)           |
|  - Context Injection: Aggregated Risk Metrics & Outlier Store Lists               |
|  - Enforced Structured Output: JSON Schema (Type.OBJECT)                          |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                               OUTPUT SPECIFICATION                                |
|  - AuditReport Data Model (Typescript / In-Memory State)                          |
|  - Structured AI Forensic Output: { executiveSummary, actionList }                |
|  - Structured Tabular Export Generation (SheetJS XLSX Serializer)                 |
+-----------------------------------------------------------------------------------+
```

### External Integrations & Tool Ecosystem

| Service / Dependency | Version / Target | Role & Functional Responsibility |
| :--- | :--- | :--- |
| **Google GenAI SDK (`@google/genai`)** | `^1.34.0` | Client library executing forensic reasoning over audit aggregate vectors using `gemini-3-flash-preview`. |
| **SheetJS (`xlsx`)** | `0.18.5` | In-memory binary parsing of spreadsheet buffers and serialization of filtered audit subsets into XLSX workbooks. |
| **Node.js / TypeScript Runtime** | `ES2022 / ESNext` | Strict type safety and execution environment for data transformations and validation matrices. |
| **Environment Variable Provider** | `process.env.GEMINI_API_KEY` / `process.env.API_KEY` | Provides authenticated access tokens for Google Gemini API endpoints. |

---

## 3. Input Specification

The backend pipeline ingests raw tabular transaction records via binary array buffers or serialized object arrays.

### 3.1 Raw Ingestion Schema & Fuzzy Alias Mapping
The ingestion parser normalizes column headers using alphanumeric stripping (`k.toLowerCase().replace(/[^a-z0-9]/g, '')`) against predefined alias sets:

| Standard Field | Canonical Type | Recognized Header Aliases |
| :--- | :--- | :--- |
| `sales` | `number` | `sales`, `grosssales`, `total`, `billamount`, `grossamount`, `totalsales`, `gross_sales`, `amount` |
| `discount` | `number` | `discount`, `(-)discount`, `discounts`, `discountamt`, `discamt`, `disc`, `discountamount`, `discount_amt` |
| `pointsRedeemed` | `number` | `loyaltypointsredeemed`, `pointsredeemed`, `used`, `pts-`, `redeemed`, `pointsburnt`, `points_redeemed`, `pts_used`, `redeemedamount`, `redeem_amt`, `points_redeem` |
| `paidAmount` | `number` | `paidamount`, `netbill`, `finalamount`, `netsales`, `netamount`, `paid_amount`, `net_sales` |
| `pointsGained` | `number` | `loyaltypointsearned`, `pointsgained`, `earned`, `pts+`, `loyaltyearned`, `pointsadded`, `points_earned`, `pts_earned` |
| `date` | `string` (ISO/Datetime) | `date`, `billdate`, `timestamp`, `datetime`, `bill_date`, `transaction_date`, `orderlogtime`, `order_log_time` |
| `billId` | `string` | `billid`, `billno`, `invoice`, `receipt`, `bill_no`, `bill_id`, `inv_no` |
| `store` | `string` | `store`, `outlet`, `location`, `branch`, `shop`, `store_name` |
| `customerName` | `string` | `customername`, `name`, `customer`, `custname`, `cust_name`, `customer_name` |
| `customerPhone` | `string` | `phone`, `customerphone`, `mobile`, `contact`, `cust_mobile`, `phone_no` |
| `remarks` | `string` | `remarks`, `reason`, `comment`, `discreason`, `note`, `discount_reason`, `remarks_field` |
| `employee` | `string` | `employee`, `staff`, `cashier`, `user`, `cashier_name`, `staff_name`, `operator` |

### 3.2 Canonical Normalized Record Schema (`Transaction`)
```typescript
interface Transaction {
  billId: string;
  store: string;
  sales: number;
  discount: number;
  paidAmount: number;
  customerName: string;
  customerPhone: string;
  remarks: string;
  employee: string;
  date: string;
  discountPercentage: number;
  redemptionPercentage: number;
  pointsGained: number;
  pointsRedeemed: number;
}
```

### 3.3 AI Agent Input Payload (`AuditReport` Summary Vector)
The Gemini Agent does not ingest unprocessed raw transaction arrays. Instead, it processes an aggregated statistical feature vector:

```typescript
interface AIAgentPayload {
  totalTransactions: number;
  overallAvgDiscount: number;
  highDiscountCount: number;         // 10% <= Discount < 25%
  extremeDiscountCount: number;      // 25% <= Discount < 90%
  compDiscountCount: number;         // Discount >= 90%
  suspiciousLoyaltyCount: number;
  highDiscountStores: string[];      // Stores with avg discount >= 1.5x system baseline
}
```

---

## 4. Analysis & Core Processing Logic

The backend execution sequence consists of five sequential processing phases:

```
[Phase 1: Ingestion & Math Normalization]
               │
               ▼
[Phase 2: Entity & Risk Tier Partitioning]
               │
               ▼
[Phase 3: Adaptive Temporal Windowing & Loyalty Fraud Matrix]
               │
               ▼
[Phase 4: Store Benchmarking & Statistical Deviation]
               │
               ▼
[Phase 5: Structured GenAI Forensic Analysis]
```

### Phase 1: Ingestion, Noise Rejection & Math Normalization
1. **Discount Disambiguation**: In many POS systems, loyalty point redemptions are aggregated into the total discount column. The engine computes direct discount by isolating point redemptions:
   $$\text{directDiscount} = \max(0, \text{parsedDiscount} - \text{parsedRedemptionAmt})$$
2. **Epsilon-Corrected Precision Percentage**:
   $$\text{discountPercentage} = \text{round}\left(\left(\frac{\text{directDiscount}}{\text{sales}} \times 100 + \epsilon\right) \times 100\right) / 100$$
   $$\text{redemptionPercentage} = \text{round}\left(\left(\frac{\text{parsedRedemptionAmt}}{\text{sales}} \times 100 + \epsilon\right) \times 100\right) / 100$$
3. **Data Scrubbing & Exclusions**:
   - Drops records containing `"mrp"` in the `remarks` column (standard price adjustments rather than manual promotional markdowns).
   - Filters out zero-activity records where $\text{sales} = 0$, $\text{discount} = 0$, $\text{pointsGained} = 0$, and $\text{pointsRedeemed} = 0$.

### Phase 2: Entity & Risk Tier Partitioning
To prevent false-positive inflation in promotional discount buckets, staff discounts are filtered first:

1. **Staff Identification Heuristic**:
   $$\text{isStaff}(t) \iff \text{remarks} \cup \text{customerName} \text{ contains } \{\text{"staff"}, \text{"internal"}, \text{"employee"}\}$$
2. **Promotional Risk Partitioning**:
   - **Staff Discounts**: $\text{isStaff}(t) = \text{true}$
   - **High Discount Tier**: $10\% \le \text{discountPercentage} < 25\% \land \neg \text{isStaff}(t)$
   - **Extreme Discount Tier**: $25\% \le \text{discountPercentage} < 90\% \land \neg \text{isStaff}(t)$
   - **Complimentary (100% Comp) Tier**: $\text{discountPercentage} \ge 90\% \land \neg \text{isStaff}(t)$
   - **Excessive Loyalty Redemption Tier**: $\text{redemptionPercentage} \ge 25\%$

### Phase 3: Adaptive Temporal Windowing & Loyalty Fraud Matrix
1. **Dynamic Time-Span Scaling**:
   Calculates total dataset duration: $\Delta t = \frac{t_{\max} - t_{\min}}{86400000 \text{ ms}}$.
   - If $\Delta t \le 5\text{ days} \implies \text{Frequency Threshold} = 3$
   - If $5 < \Delta t \le 15\text{ days} \implies \text{Frequency Threshold} = 5$
   - If $\Delta t > 15\text{ days} \implies \text{Frequency Threshold} = 10$
2. **Dummy Identifier Rejection**:
   Ignores phone numbers matching repetition regex (`/^(.)\1+$/`), system placeholders (`0000000000`, `1234567890`, `9876543210`), or string lengths $< 5$.
3. **Suspicious Behavioral Flag Matrix**:
   For accounts meeting or exceeding the dynamic threshold:
   - **Proxy ID (Multi-Name)**: $\text{count}(\text{Unique Customer Names}) > 2$
   - **Critical Frequency**: $\text{count}(\text{Transactions}) > 20$
   - **Multi-Store Footprint**: $\text{count}(\text{Unique Stores}) > 3$
   - **Cash-Out Points**: $\text{totalPointsRedeemed} > 0$

### Phase 4: Store Benchmarking & Statistical Deviation
1. Aggregates all transactions by `store`.
2. Computes store average discount:
   $$\overline{D}_{\text{store}} = \frac{\sum \text{discount}_{\text{store}}}{\sum \text{sales}_{\text{store}}} \times 100$$
3. Categorizes risk relative to system-wide baseline $\overline{D}_{\text{system}}$:
   - **High Risk**: $\overline{D}_{\text{store}} \ge 1.5 \times \overline{D}_{\text{system}}$
   - **Low Risk**: $\overline{D}_{\text{store}} \le 0.5 \times \overline{D}_{\text{system}}$
   - **Average**: $0.5 \times \overline{D}_{\text{system}} < \overline{D}_{\text{store}} < 1.5 \times \overline{D}_{\text{system}}$

### Phase 5: Structured GenAI Forensic Reasoning
The backend formats the aggregated metrics into a specialized forensic audit prompt and invokes `gemini-3-flash-preview`.

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
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
```

#### Deterministic Error Fallback
If the API call fails or encounters network/rate constraints, the backend catches the exception and returns deterministic fallback objects:
```json
{
  "executiveSummary": "Error generating forensic summary. Please review raw data below.",
  "actionList": ["Audit API currently unavailable. Review flags manually."]
}
```

---

## 5. Output Specification

### 5.1 In-Memory Aggregation Model (`AuditReport`)
```typescript
interface AuditReport {
  overallAvgDiscount: number;
  totalTransactions: number;
  highDiscountBills: Transaction[];
  extremeDiscountBills: Transaction[];
  compBills: Transaction[];
  staffDiscountBills: Transaction[];
  excessiveLoyaltyBills: Transaction[];
  storeBenchmarking: StoreBenchmarking[];
  suspiciousLoyalty: SuspiciousLoyalty[];
  loyaltyThreshold: number;
  rawTransactions: Transaction[];
  aiExecutiveSummary: string;
  aiActionList: string[];
}
```

### 5.2 Structured AI Agent Output Payload
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "executiveSummary": {
      "type": "string",
      "description": "Synthesized executive evaluation detailing revenue exposure, discount policy violations, and staff point-loading risks."
    },
    "actionList": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Prioritized operational steps and store-level investigation mandates for loss prevention."
    }
  },
  "required": ["executiveSummary", "actionList"]
}
```

#### Example Raw Response:
```json
{
  "executiveSummary": "Audit of 14,820 transactions revealed an overall discount rate of 6.42%, with severe localized anomalies at Outlet-North and Mall-Branch where discount rates exceeded 14.8%. We detected 12 loyalty accounts with high multi-name proxy velocity, indicating active staff point accumulation during peak shifts.",
  "actionList": [
    "Conduct immediate register audits at Outlet-North focusing on operator #402.",
    "Restrict manual discount authorization above 15% to store managers with mandatory reason code logging.",
    "Investigate phone identifier +19875550192 associated with 34 transactions across 5 distinct customer names.",
    "Enforce OTP verification on loyalty point redemption transactions exceeding 500 points."
  ]
}
```

### 5.3 Tabular Export Specification
The system produces structured XLSX workbook blobs partitioned by risk tier and remarks status (`WITH_REMARKS` vs `NO_REMARKS`) with canonical column alignment:

- Target Worksheet Name: `"Forensic Data"`
- Normalized Columns: `billId`, `store`, `sales`, `discount`, `paidAmount`, `customerName`, `customerPhone`, `remarks`, `employee`, `date`, `discountPercentage`, `redemptionPercentage`, `pointsGained`, `pointsRedeemed`.
