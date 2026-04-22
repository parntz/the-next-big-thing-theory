const { getDb } = require("./lib/db/client");

async function addColumns() {
  try {
    const db = getDb();
    
    console.log("Connected to Turso database");
    
    // Add is_top_competitor column
    console.log("Adding is_top_competitor column...");
    await db.execute(`
      ALTER TABLE competitors 
      ADD COLUMN is_top_competitor BOOLEAN DEFAULT 0
    `);
    
    // Add competitive_score column
    console.log("Adding competitive_score column...");
    await db.execute(`
      ALTER TABLE competitors 
      ADD COLUMN competitive_score INTEGER
    `);
    
    console.log("Columns added successfully!");
    
    // Verify the columns were added
    const result = await db.execute(`
      PRAGMA table_info(competitors)
    `);
    
    console.log("Current competitors table schema:");
    result.rows.forEach(row => {
      console.log(`- ${row.name}: ${row.type}`);
    });
    
  } catch (error) {
    console.error("Error:", error);
  }
}

addColumns();