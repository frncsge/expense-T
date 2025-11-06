import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";

const app = express();
const port = 3000;
const db = new pg.Client({
  user: "postgres",
  password: "goofygoober",
  host: "localhost",
  port: 5432,
  database: "joseph_expense_tracker",
});
db.connect();

const userId = 1;

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", "./views");

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/dashboard", async (req, res) => {
  const { categoryId } = req.query;

  try {
    const budgetResult = await db.query(
      "SELECT * FROM budget WHERE userid = $1;",
      [userId]
    );
    const totalExpense = await db.query(
      "SELECT SUM(amount) AS total_amount FROM expense WHERE userid = $1;",
      [userId]
    );
    const categoriesResult = await db.query(
      "SELECT * FROM category WHERE userid = $1;",
      [userId]
    );

    const totalSpent = totalExpense.rows[0].total_amount || 0;
    const totalBudget = budgetResult.rows[0]?.amount || 0;
    const remaining = totalBudget; // Since we auto-deduct on insert

    let selectedCategory = null;
    let expenses = [];

    if (categoryId) {
      const selectedCategoryResult = await db.query(
        "SELECT * FROM category WHERE categoryid = $1",
        [categoryId]
      );
      const expensesResult = await db.query(
        "SELECT * FROM expense WHERE categoryid = $1",
        [categoryId]
      );
      selectedCategory = selectedCategoryResult.rows[0];
      expenses = expensesResult.rows;
    }

    res.render("dashb.ejs", {
      categories: categoriesResult.rows,
      budget: remaining,
      selectedCategory,
      expenses,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send("Server error");
  }
});

app.get("/", (req, res) => {
  res.send("roah bayot");
});

// 💵 Add or Update Budget
app.post("/budget", async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid budget amount" });
  }

  try {
    const existing = await db.query("SELECT * FROM budget WHERE userid = $1", [
      userId,
    ]);

    if (existing.rows.length > 0) {
      // Update existing budget
      await db.query("UPDATE budget SET amount = $1 WHERE userid = $2", [
        amount,
        userId,
      ]);
    } else {
      // Insert new budget record
      await db.query("INSERT INTO budget (amount, userid) VALUES ($1, $2)", [
        amount,
        userId,
      ]);
    }

    res.status(200).json({ message: "Budget saved successfully" });
  } catch (error) {
    console.error("Error saving budget:", error);
    res.status(500).json({ error: "Failed to save budget" });
  }
});

app.listen(port, () => {
  console.log(`✅ Server is listening on http://localhost:${port}`);
});

// ➕ Add category
app.post("/category", async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Category name is required" });
  }

  try {
    await db.query("INSERT INTO category (name, userId) VALUES ($1, $2)", [
      name.trim(),
      userId,
    ]);
    res.status(200).json({ message: "Category added successfully" });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ error: "Failed to add category" });
  }
});

app.delete("/category/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "DELETE FROM category WHERE categoryId = $1",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

app.delete("/expense/:expenseId", async (req, res) => {
  const { expenseId } = req.params;

  try {
    await db.query("DELETE FROM expense WHERE expenseid = $1", [expenseId]);
    res.status(200).json({ message: "Expense deleted" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// ➕ Add Expense and auto-update budget
app.post("/expense", async (req, res) => {
  const { description, amount, categoryid } = req.body;

  if (!description || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid expense data" });
  }

  try {
    // 1️⃣ Insert new expense
    await db.query(
      "INSERT INTO expense (description, amount, categoryid, userid) VALUES ($1, $2, $3, $4)",
      [description, amount, categoryid, userId]
    );

    // 2️⃣ Subtract from budget
    const currentBudget = await db.query(
      "SELECT amount FROM budget WHERE userid = $1",
      [userId]
    );
    if (currentBudget.rows.length > 0) {
      const newAmount =
        parseFloat(currentBudget.rows[0].amount) - parseFloat(amount);
      await db.query("UPDATE budget SET amount = $1 WHERE userid = $2", [
        newAmount,
        userId,
      ]);
    }

    res.status(200).json({ message: "Expense added and budget updated" });
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

//login route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    //check if username is correct
    const result = await db.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    const storedUsername = result.rows[0]?.username;
    if (!storedUsername)
      return res.render("login.ejs", {
        message: "Invalid username or password",
      });

    //check password if correct
    const storedPasswordHash = result.rows[0].password_hash;
    const isPasswordCorrect = await bcrypt.compare(
      password,
      storedPasswordHash
    );
    if (!isPasswordCorrect)
      return res.render("login.ejs", {
        message: "Invalid username or password",
      });

    res.redirect("/dashboard");
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});
