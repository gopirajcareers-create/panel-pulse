# Hybrid Search Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                                │
│  GET /api/v1/search/hybrid?q=query&bm25_weight=0.5...          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    ROUTE HANDLER                                 │
│                  search.js /hybrid                               │
│  ✓ Parse query parameters                                       │
│  ✓ Validate parameters & ranges                                 │
│  ✓ Call searchHybrid() service                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              HYBRID SEARCH SERVICE FUNCTION                      │
│                   searchService.js                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
            ┌─────────────────┴─────────────────┐
            ↓                                   ↓
    ┌───────────────────┐         ┌──────────────────────┐
    │   BM25 PIPELINE   │         │  VECTOR PIPELINE     │
    ├───────────────────┤         ├──────────────────────┤
    │ 1. $search stage  │         │ 1. Embed query       │
    │    (BM25 index)   │         │    (embedding svc)   │
    │                   │         │                      │
    │ 2. $project       │         │ 2. $addFields        │
    │    (get scores)   │         │    (cosine distance) │
    │                   │         │                      │
    │ 3. $match         │         │ 3. $match            │
    │    (filters)      │         │    (min_score)       │
    │                   │         │                      │
    │ 4. $sort (score)  │         │ 4. $match (filters)  │
    │                   │         │                      │
    │ 5. Get ≤100 docs  │         │ 5. $project          │
    └───────────────────┘         │                      │
            ↓                      │ 6. Get ≤100 docs     │
       BM25 Results                └──────────────────────┘
      [score, rank]                       ↓
            │                      Vector Results
            │                    [similarity, rank]
            └──────────────┬──────────────┘
                          ↓
      ┌────────────────────────────────────┐
      │      SCORE NORMALIZATION           │
      ├────────────────────────────────────┤
      │ BM25:                              │
      │  • Max in result set = 1.0         │
      │  • Others = score / max            │
      │                                    │
      │ Vector: Already 0-1 (cosine)       │
      └────────────────────────────────────┘
                          ↓
      ┌────────────────────────────────────┐
      │      WEIGHTED COMBINATION          │
      ├────────────────────────────────────┤
      │ hybrid_score =                     │
      │   (bm25_norm × w1) +               │
      │   (vector_sim × w2)                │
      │                                    │
      │ where w1 + w2 = 1.0 (normalized)   │
      └────────────────────────────────────┘
                          ↓
      ┌────────────────────────────────────┐
      │    MERGE & RE-RANK                 │
      ├────────────────────────────────────┤
      │ 1. Combine results from both paths │
      │ 2. Sort by hybrid_score DESC       │
      │ 3. Apply limit & skip pagination   │
      │ 4. Map to response format          │
      └────────────────────────────────────┘
                          ↓
      ┌────────────────────────────────────┐
      │      FORMATTED RESPONSE            │
      ├────────────────────────────────────┤
      │ {                                  │
      │   "success": true,                 │
      │   "search_type": "hybrid",         │
      │   "query": "...",                  │
      │   "search_weights": {...},         │
      │   "results": [                     │
      │     {                              │
      │       "hybrid_score": 4.21,        │
      │       "bm25_score": 4.52,          │
      │       "vector_score": 0.89,        │
      │       "score_breakdown": {...}     │
      │     }                              │
      │   ]                                │
      │ }                                  │
      └────────────────────────────────────┘
                          ↓
                    CLIENT RESPONSE
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MONGODB COLLECTION                         │
│                         (panel_collection)                          │
│                                                                     │
│  Doc 1: [_id, text, Transcript, embedding, field_type, ...]       │
│  Doc 2: [_id, text, Transcript, embedding, field_type, ...]       │
│  Doc 3: [_id, text, Transcript, embedding, field_type, ...]       │
│  ...                                                                │
└─────────────────────────────────────────────────────────────────────┘
         ↑                                    ↑
         │                                    │
    BM25 Index                          Embedding Field
    (bm25_index)                        (1024 dimensions)
         │                                    │
         └─────────────────┬──────────────────┘
                          │
                          │ MongoDB Aggregation Pipeline
                          │
            ┌─────────────┴─────────────┐
            ↓                           ↓
    ┌─────────────────┐      ┌──────────────────┐
    │ $search stage   │      │ Query Embedding  │
    │ (term matching) │      │ (embedding svc)  │
    │ returns:        │      │ generates:       │
    │  - _id          │      │  [f1, f2, ...f   │
    │  - score        │      │   1024]          │
    │  - highlights   │      │                  │
    └─────────────────┘      └──────────────────┘
            ↓                           ↓
        Results A                   Results B
        (score map)           (similarity map)
            │                        │
            └────────────┬───────────┘
                        ↓
                   Unified Map
                   (doc → scores)
                        ↓
                  Normalize & Weight
                        ↓
                   Sorted Results
                  (by hybrid_score)
                        ↓
                   Apply Pagination
                        ↓
                   Format & Return
```

## Weight Tuning Strategy

```
                    Vector Weight (Semantics)
                              ↑
                         100% │     Semantic
                              │    Focused
                           80%├─────────────────────
                              │
                           60%├─────────────────────
                              │       Balanced
                           40%├─────────────────────
                              │
                           20%├─────────────────────
                              │     Keyword
                            0%└─────────────────────→ BM25 Weight
                              0   20   40   60   80  100%
                                  (Keywords)

    Use Cases:
    • (80, 20):  Legal documents, compliance
    • (70, 30):  Technical specifications
    • (60, 40):  Product documentation
    • (50, 50):  General search (default)
    • (40, 60):  Knowledge base
    • (30, 70):  FAQ, intent-based
    • (20, 80):  Conversational QA
```

## Error Handling Flow

```
┌─────────────────┐
│  Search Request │
└────────┬────────┘
         ↓
    ┌────────────────────────────────┐
    │  Parameter Validation          │
    │  • q exists? NO ──→ 400 Error  │
    │  • weights in [0,1]? NO ──→    │
    │  • limit in [1,100]? NO ──→    │
    └────┬──────────┬─────────────────┘
         │ PASS     │
         ↓          │
    Execute Search  │
         ↓          │
    ┌────────────────────────────────┐
    │  BM25 & Vector Parallel        │
    │  • BM25 fails? Continue with   │
    │    vector-only (graceful)      │
    │  • Vector fails? Continue with │
    │    BM25-only (graceful)        │
    │  • Both fail? 500 Error        │
    └────┬─────────┬─────────────────┘
         │ OK      │
         ↓         │
    Merge Results   │
         ↓         │
    Format & Return │
         ↓         │
      200 OK        │
             FAIL ──┘
```

## Score Calculation Example

```
Document: "SQL Query Optimization"

BM25 Path:
├─ Raw BM25 Score: 4.521
├─ Max score in result set: 5.0
└─ Normalized: 4.521 / 5.0 = 0.904

Vector Path:
├─ Query embedding: [0.12, -0.45, 0.78, ...]
├─ Document embedding: [0.11, -0.43, 0.79, ...]
└─ Cosine similarity: 0.894

Hybrid Calculation (weights 0.5 / 0.5):
├─ BM25 contribution: 0.904 × 0.5 = 0.452
├─ Vector contribution: 0.894 × 0.5 = 0.447
└─ Hybrid Score: 0.452 + 0.447 = 0.899 → 4.21 (scaled to 0-5)
```

## Feature Coverage

```
✅ Implementation Complete

Core Features:
  ✓ Parallel BM25 + Vector execution
  ✓ Configurable weight distribution
  ✓ Score normalization
  ✓ Graceful degradation
  ✓ Filtering by field_type & job_id
  ✓ Pagination support
  ✓ Detailed score breakdowns
  ✓ Comprehensive parameter validation
  ✓ Robust error handling

API Endpoint:
  ✓ GET /api/v1/search/hybrid
  ✓ Query parameter parsing
  ✓ Request validation
  ✓ Response formatting
  ✓ Error responses

Documentation:
  ✓ Configuration guide
  ✓ API reference
  ✓ Usage examples
  ✓ Testing guide
  ✓ Architecture overview
```

