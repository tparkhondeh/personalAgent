CREATE TABLE BudgetMeta(id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, cap INTEGER NOT NULL, latestMonth TEXT NOT NULL, halted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE BudgetReceipt(id TEXT PRIMARY KEY, month TEXT NOT NULL, charged INTEGER NOT NULL CHECK(charged>=0), settled INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, inputTokens INTEGER, outputTokens INTEGER, cachedTokens INTEGER);
CREATE INDEX BudgetReceipt_period ON BudgetReceipt(month,settled);
