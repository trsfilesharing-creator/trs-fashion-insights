require("dotenv").config();

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const nodemailer = require("nodemailer");
const path = require("path");

// =====================================================
// EXPRESS APP
// =====================================================

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;
// =====================================================
// WHATSAPP WEB
// =====================================================

const whatsappClient = new Client({
  authStrategy: new LocalAuth({
    clientId: "trs-fashion",
  }),

  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

let whatsappReady = false;

// =====================================================
// NODEMAILER
// =====================================================

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// =====================================================
// WHATSAPP QR
// =====================================================

whatsappClient.on("qr", (qr) => {
  console.log("");
  console.log("====================================");
  console.log("SCAN THIS QR CODE WITH WHATSAPP");
  console.log("====================================");

  qrcode.generate(qr, { small: true });

  console.log("====================================");
});

// =====================================================
// WHATSAPP AUTHENTICATED
// =====================================================

whatsappClient.on("authenticated", () => {
  console.log("WhatsApp authenticated successfully!");
});

// =====================================================
// WHATSAPP READY
// =====================================================

whatsappClient.on("ready", () => {
  whatsappReady = true;
  console.log("WhatsApp Web is ready!");
});

// =====================================================
// WHATSAPP AUTH FAILURE
// =====================================================

whatsappClient.on("auth_failure", (message) => {
  whatsappReady = false;
  console.error("WhatsApp authentication failed:", message);
});

// =====================================================
// WHATSAPP DISCONNECTED
// =====================================================

whatsappClient.on("disconnected", (reason) => {
  whatsappReady = false;
  console.log("WhatsApp disconnected:", reason);
});

// =====================================================
// CORS
// =====================================================

app.use(
  cors({
    origin: [
      "http://localhost:8080",
      "http://localhost:5173",
      "http://localhost:3000",
      "https://trs-fashion-backend.onrender.com",
      /\.vercel\.app$/ // This automatically allows any preview or production URL from Vercel
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"]
  })
);
// =====================================================
// BODY PARSER
// =====================================================

app.use(express.json());

// =====================================================
// MONGODB
// =====================================================

const mongoUrl = process.env.MONGODB_URI || "mongodb://localhost:2707";
const client = new MongoClient(mongoUrl);

// =====================================================
// SESSION
// =====================================================

app.use(
  session({
    secret: process.env.SESSION_SECRET || "trs-fashion-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// =====================================================
// PASSPORT CONFIGURATION
// =====================================================

app.use(passport.initialize());
app.use(passport.session());

const googleCallbackURL =
  process.env.GOOGLE_CALLBACK_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://trs-fashion-backend.onrender.com/auth/google/callback"
    : `http://localhost:${PORT}/auth/google/callback`);

console.log("Configured Google OAuth callbackURL:", googleCallbackURL);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: googleCallbackURL,
    },
    function (accessToken, refreshToken, profile, done) {
      console.log("Google login successful:", profile.displayName);
      return done(null, profile);
    },
  ),
);

// =====================================================
// SERIALIZE / DESERIALIZE
// =====================================================

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.send("TRS Fashion backend is running!");
});

// =====================================================
// GOOGLE LOGIN & CALLBACK
// =====================================================

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/",
  }),
  (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
    res.redirect(`${frontendUrl}/app`);
  },
);

// =====================================================
// AUTH USER & LOCAL LOGIN & LOGOUT
// =====================================================

app.post("/auth/login", (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const inputIdentifier = String(username || email || "").trim();
    const inputPassword = String(password || "").trim();

    if (!inputIdentifier || !inputPassword) {
      return res.status(400).json({
        authenticated: false,
        error: "Username and Password are required.",
      });
    }

    // ── Exclusive admin credentials ──
    const ADMIN_USERNAME = "TRSAdmin";
    const ADMIN_PASSWORD = "Platmsg@TRS#1277N";

    if (inputIdentifier !== ADMIN_USERNAME || inputPassword !== ADMIN_PASSWORD) {
      return res.status(403).json({
        authenticated: false,
        error: "Access is restricted. Only authorised store administrators may sign in.",
      });
    }

    const adminUser = {
      displayName: "TRS Admin",
      name: "TRS Admin",
      email: "info@trsfashions.com",
      photo: "",
    };

    req.session.user = adminUser;

    if (req.login) {
      req.login(adminUser, (err) => {
        if (err) {
          console.error("Error in req.login during local login:", err);
        }
        return res.status(200).json({
          authenticated: true,
          user: adminUser,
          message: "Login successful",
        });
      });
    } else {
      return res.status(200).json({
        authenticated: true,
        user: adminUser,
        message: "Login successful",
      });
    }
  } catch (error) {
    console.error("Error in /auth/login:", error);
    return res.status(500).json({
      authenticated: false,
      error: "Internal server error during login.",
    });
  }
});

app.get("/auth/user", (req, res) => {
  const sessionUser = req.user || (req.session && req.session.user);
  const isAuth = Boolean(
    (req.isAuthenticated && req.isAuthenticated()) || (req.session && req.session.user),
  );

  if (isAuth && sessionUser) {
    const profile = sessionUser;
    const name =
      profile.displayName ||
      profile.name ||
      (profile.name
        ? `${profile.name.givenName || ""} ${profile.name.familyName || ""}`.trim()
        : "") ||
      "Store Admin";
    const email =
      (profile.emails && profile.emails[0] && profile.emails[0].value) ||
      (typeof profile.email === "string" ? profile.email : "info@trsfashions.com");
    const photo =
      (profile.photos && profile.photos[0] && profile.photos[0].value) ||
      (typeof profile.picture === "string"
        ? profile.picture
        : typeof profile.photo === "string"
          ? profile.photo
          : "");

    return res.status(200).json({
      authenticated: true,
      name,
      email,
      photo,
    });
  }

  return res.status(200).json({
    authenticated: false,
    name: "Store Admin",
    email: "",
    photo: "",
  });
});

app.all("/auth/logout", (req, res) => {
  const rawBase =
    process.env.FRONTEND_URL ||
    (req.headers.referer ? new URL(req.headers.referer).origin : "http://localhost:8080");
  const frontendUrl = String(rawBase).replace(/\/+$/, "");

  const sendResponse = () => {
    if (req.accepts("json") && !req.accepts("html") && req.xhr) {
      return res.status(200).json({ success: true, message: "Logged out successfully" });
    }
    return res.redirect(`${frontendUrl}/`);
  };

  const destroySession = () => {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session during logout:", err);
        }
        res.clearCookie("connect.sid", { path: "/" });
        sendResponse();
      });
    } else {
      res.clearCookie("connect.sid", { path: "/" });
      sendResponse();
    }
  };

  if (req.logout) {
    req.logout((err) => {
      if (err) {
        console.error("Error calling req.logout:", err);
      }
      destroySession();
    });
  } else {
    destroySession();
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function findFormValue(rawCustomer, possibleKeys) {
  if (!rawCustomer || !Array.isArray(possibleKeys)) {
    return "";
  }

  // Exact match
  for (const key of possibleKeys) {
    if (
      Object.prototype.hasOwnProperty.call(rawCustomer, key) &&
      rawCustomer[key] !== null &&
      rawCustomer[key] !== undefined &&
      String(rawCustomer[key]).trim() !== ""
    ) {
      return String(rawCustomer[key]).trim();
    }
  }

  // Normalized match
  const normalizeKey = (value) =>
    String(value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const normalizedKeys = possibleKeys.map(normalizeKey);

  for (const [actualKey, value] of Object.entries(rawCustomer)) {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ) {
      continue;
    }

    const normalizedActualKey = normalizeKey(actualKey);

    if (normalizedKeys.includes(normalizedActualKey)) {
      return String(value).trim();
    }
  }

  return "";
}

// =====================================================
// FORMAT CUSTOMER
// =====================================================

function formatCustomer(rawCustomer) {
  const purchaseFrequency =
  rawCustomer.purchaseFrequency ||
  rawCustomer["Purchase Frequency"] ||
  rawCustomer["Frequency"] ||
  rawCustomer["frequency"] ||
  rawCustomer["How frequently you buy clothes?"] ||
  rawCustomer["How frequently do you buy clothes?"] ||
  rawCustomer["How often do you buy clothes?"] ||
  findFormValue(rawCustomer, [
    "How frequently you buy clothes?",
    "How frequently you buy clothes",
    "How often do you buy clothes?",
    "How often do you buy clothes",
    "Purchase Frequency",
    "purchaseFrequency",
    "Frequency",
    "frequency",
  ]) ||
  "—";

  const productPurchased = 
    rawCustomer.productPurchased ||
    rawCustomer.category ||
    findFormValue(rawCustomer, [
      "What product did you purchase?",
      "What product did you purchase",
      "Product Purchased",
      "productPurchased",
    ]) || "-";

  const purchaseAmount = 
    rawCustomer.purchaseAmount ||
    findFormValue(rawCustomer, [
      "How much did you spend on your purchase?",
      "How much did you spend on your purchase",
      "Purchase Amount",
      "purchaseAmount",
    ]) || "0";

  const purchaseDate = 
    rawCustomer.purchaseDate ||
    findFormValue(rawCustomer, [
      "When did you purchase clothes from TRS Fashion?",
      "When did you purchase clothes from TRS Fashion",
      "When did you purchase from TRS Fashion?",
      "Purchase Date",
      "purchaseDate",
    ]) || "";

  const heardAboutUs = 
    rawCustomer.heardAboutUs ||
    findFormValue(rawCustomer, [
      "How did you hear about TRS Fashion?",
      "How did you hear about TRS Fashion",
      "Heard About Us",
      "heardAboutUs",
    ]) || "";

  const notificationPreference = 
    rawCustomer.notificationPreference ||
    rawCustomer.updatesPromotions ||
    findFormValue(rawCustomer, [
      "Would you like to receive updates about new arrivals, offers and promotions from TRS Fashion?",
      "Would you like to receive updates about new arrivals, offers and promotions from TRS Fashion",
      "Updates / Promotions",
      "Notification Preference",
      "notificationPreference",
    ]) || "";

  const customerName = 
    rawCustomer.name ||
    findFormValue(rawCustomer, [
      "Customer Name",
      "Name",
      "name",
    ]) || "Unknown";

  const email = 
    rawCustomer.email ||
    findFormValue(rawCustomer, [
      "Email Address",
      "Email",
      "email",
    ]) || "";

  const mobile = 
    rawCustomer.mobile ||
    findFormValue(rawCustomer, [
      "Mobile Number",
      "Mobile",
      "mobile",
    ]) || "";

  const city = 
    rawCustomer.city ||
    findFormValue(rawCustomer, [
      "City",
      "city",
    ]) || "";

  const timestamp = 
    rawCustomer.timestamp ||
    rawCustomer.formTimestamp ||
    rawCustomer.createdAt ||
    "";

  return {
    ...rawCustomer,

    id: rawCustomer._id
      ? rawCustomer._id.toString()
      : rawCustomer.id,

    name: customerName,
    email,
    mobile,
    city,

    productPurchased,
    purchaseAmount,
    purchaseDate,
    purchaseFrequency,

    heardAboutUs,
    notificationPreference,

    status: rawCustomer.status || "Active",

    category:
      rawCustomer.category ||
      productPurchased ||
      "General",

    preferredSareeTypes: Array.isArray(
      rawCustomer.preferredSareeTypes,
    )
      ? rawCustomer.preferredSareeTypes
      : [],

    marketingConsent:
      typeof rawCustomer.marketingConsent === "boolean"
        ? rawCustomer.marketingConsent
        : String(notificationPreference).toLowerCase().includes("yes") ||
          String(notificationPreference).toLowerCase().includes("whatsapp") ||
          String(notificationPreference).toLowerCase().includes("email"),

    formTimestamp: timestamp,
  };
}

// =====================================================
// WHATSAPP NUMBER HELPER
// =====================================================

function normalizeWhatsAppNumber(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  let digits = raw.replace(/\D/g, "");

  // Indian 10-digit number
  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  // Indian number starting with 0
  else if (digits.startsWith("0") && digits.length === 11) {
    digits = `91${digits.slice(1)}`;
  }

  return digits;
}

function formatPersonalizedMessage(messageTemplate, customerName = "Customer", defaultCategory = "Collection") {
  let text = String(messageTemplate || "").trim();
  if (!text) {
    text = `Hi {{name}} 👋\n\nOur new ${defaultCategory} collection has arrived at TRS Fashion!\n\n🌐 TRS Fashions Website: https://trsfashions.com/\n📸 TRS Fashions Instagram: https://www.instagram.com/trs_fashions/\n\nVisit TRS Fashion to shop your favorites.`;
  }

  // Replace {{name}} or {name} with the actual customer name
  if (text.includes("{{name}}") || text.includes("{name}")) {
    text = text.replace(/\{\{name\}\}/gi, customerName).replace(/\{name\}/gi, customerName);
  }

  return text;
}

// =====================================================
// EMAIL SENDER
// =====================================================

async function sendCampaignEmail(customer, campaign) {
  try {
    if (!customer.email) {
      console.log(`No email found for ${customer.name}`);
      return false;
    }

    const itemCategory = campaign.product || campaign.category || "Collection";
    const imageHtml = campaign.image ? `<div style="margin-bottom: 20px;"><img src="${campaign.image}" alt="Campaign Banner" style="max-width: 100%; height: auto; border-radius: 8px;" /></div>` : "";
    const customerName = customer.name || "Customer";
    const finalMessage = formatPersonalizedMessage(campaign.message, customerName, itemCategory);

    const mailOptions = {
      from: `"TRS Fashion" <${process.env.EMAIL_USER}>`,
      to: customer.email,
      subject: `TRS Fashion | ${itemCategory} Update`,
      text: finalMessage,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eeeeee; border-radius: 8px;">
          ${imageHtml}
          <div style="white-space: pre-wrap; font-size: 15px; color: #222222;">${finalMessage.replace(/\n/g, "<br>")}</div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    console.log(`Email sent successfully to ${customer.name} (${customer.email})`);
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${customer.email}:`, error.message);
    return false;
  }
}

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
  try {
    // =================================================
    // CONNECT TO MONGODB
    // =================================================

    await client.connect();

    console.log("MongoDB connected successfully!");

    const db = client.db("trs_fashion");

    const customersCollection = db.collection("customers");
    const productsCollection = db.collection("products");
    const campaignsCollection = db.collection("campaigns");
    const settingsCollection = db.collection("settings");

    // Default settings
    const defaultStoreSettings = {
      storeName: "TRS Fashion",
      storeEmail: "info@trsfashions.com",
      storePhone: "+91 99004 05008",
      emailNotifications: true,
      whatsappNotifications: true,
      newArrivalAlerts: true,
      defaultChannel: "Email + WhatsApp",
      defaultAudience: "Customers who purchased the same category",
      messageTemplate:
        "Namaste {{name}}! We are thrilled to share that new designs have just arrived at TRS Fashion that match your style. Visit our boutique or reply to this message to explore the collection.",
    };

    // =================================================
    // GET STORE SETTINGS
    // =================================================

    app.get(["/settings", "/api/settings"], async (req, res) => {
      try {
        const savedSettings = await settingsCollection.findOne({ key: "store_settings" });
        if (!savedSettings) {
          return res.status(200).json(defaultStoreSettings);
        }

        const { _id, key, updatedAt, createdAt, ...cleanSettings } = savedSettings;
        return res.status(200).json({
          ...defaultStoreSettings,
          ...cleanSettings,
        });
      } catch (error) {
        console.error("Error fetching store settings:", error);
        return res.status(500).json({
          error: "Failed to fetch store settings",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // =================================================
    // SAVE / UPDATE STORE SETTINGS
    // =================================================

    const handleSaveSettings = async (req, res) => {
      try {
        const {
          storeName,
          storeEmail,
          storePhone,
          emailNotifications,
          whatsappNotifications,
          newArrivalAlerts,
          defaultChannel,
          defaultAudience,
          messageTemplate,
        } = req.body || {};

        const settingsData = {
          storeName:
            storeName !== undefined ? String(storeName).trim() : defaultStoreSettings.storeName,
          storeEmail:
            storeEmail !== undefined ? String(storeEmail).trim() : defaultStoreSettings.storeEmail,
          storePhone:
            storePhone !== undefined ? String(storePhone).trim() : defaultStoreSettings.storePhone,
          emailNotifications:
            typeof emailNotifications === "boolean"
              ? emailNotifications
              : Boolean(emailNotifications ?? defaultStoreSettings.emailNotifications),
          whatsappNotifications:
            typeof whatsappNotifications === "boolean"
              ? whatsappNotifications
              : Boolean(whatsappNotifications ?? defaultStoreSettings.whatsappNotifications),
          newArrivalAlerts:
            typeof newArrivalAlerts === "boolean"
              ? newArrivalAlerts
              : Boolean(newArrivalAlerts ?? defaultStoreSettings.newArrivalAlerts),
          defaultChannel: defaultChannel || defaultStoreSettings.defaultChannel,
          defaultAudience: defaultAudience || defaultStoreSettings.defaultAudience,
          messageTemplate:
            messageTemplate !== undefined
              ? String(messageTemplate)
              : defaultStoreSettings.messageTemplate,
          key: "store_settings",
          updatedAt: new Date(),
        };

        await settingsCollection.updateOne(
          { key: "store_settings" },
          { $set: settingsData },
          { upsert: true },
        );

        const { key, ...responseSettings } = settingsData;
        return res.status(200).json(responseSettings);
      } catch (error) {
        console.error("Error saving store settings:", error);
        return res.status(500).json({
          error: "Failed to save store settings",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    };

    app.post(["/settings", "/api/settings"], handleSaveSettings);
    app.put(["/settings", "/api/settings"], handleSaveSettings);

    // =================================================
    // GET ALL CUSTOMERS
    // =================================================

    app.get("/customers", async (req, res) => {
      try {
        const customers = await customersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        
        const formattedCustomers = customers.map(formatCustomer);
        res.status(200).json(formattedCustomers);
      } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ error: "Failed to fetch customers" });
      }
    });

    // =================================================
    // DASHBOARD STATS
    // =================================================

    app.get("/api/dashboard/stats", async (req, res) => {
      try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const totalCustomers = await customersCollection.countDocuments({});
        const newCustomers = await customersCollection.countDocuments({
          createdAt: { $gte: thirtyDaysAgo },
        });
        const products = await productsCollection.countDocuments({});
        const campaignsSent = await campaignsCollection.countDocuments({
          status: "Sent",
        });

        res.status(200).json({
          totalCustomers,
          newCustomers,
          products,
          campaignsSent,
        });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ error: "Failed to fetch dashboard statistics" });
      }
    });

    // =================================================
    // REAL ANALYTICS DATA ENDPOINT
    // =================================================

    app.get("/api/analytics", async (req, res) => {
      try {
        const customers = await customersCollection.find({}).toArray();
        
        const totalCustomers = customers.length;
        
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const newCustomers = customers.filter(c => new Date(c.createdAt || c.timestamp) >= thirtyDaysAgo).length;

        let totalPurchases = 0;
        let estimatedSales = 0;
        const categoryCounts = {};
        const cityCounts = {};

        customers.forEach(rawC => {
          const c = formatCustomer(rawC);
          if (c.productPurchased && c.productPurchased !== "-") {
            totalPurchases++;
          }

          const amount = Number(String(c.purchaseAmount || "").replace(/\D/g, ""));
          if (!isNaN(amount)) {
            estimatedSales += amount;
          }

          const cat = String(c.productPurchased || c.category || "General").trim();
          if (cat && cat !== "-") {
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
          }

          const city = String(c.city || "Unknown").trim();
          if (city) {
            cityCounts[city] = (cityCounts[city] || 0) + 1;
          }
        });

        res.status(200).json({
          totalCustomers,
          newCustomers,
          totalPurchases,
          estimatedSales,
          categoryBreakdown: categoryCounts,
          cityBreakdown: cityCounts,
        });
      } catch (error) {
        console.error("Error fetching analytics:", error);
        res.status(500).json({ error: "Failed to fetch analytics data" });
      }
    });

    // =================================================
    // GET CUSTOMER BY ID
    // =================================================

    app.get("/customers/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid customer ID" });
        }

        const customer = await customersCollection.findOne({ _id: new ObjectId(id) });

        if (!customer) {
          return res.status(404).json({ error: "Customer not found" });
        }

        res.status(200).json(formatCustomer(customer));
      } catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ error: "Failed to fetch customer" });
      }
    });

    // =================================================
    // CREATE CUSTOMER (MANUAL)
    // =================================================

    app.post("/customers", async (req, res) => {
      try {
        const {
          name,
          email,
          mobile,
          city,
          productPurchased,
          category,
          purchaseAmount,
          purchaseDate,
          purchaseFrequency,
          heardAboutUs,
          notificationPreference,
          marketingConsent,
          status,
          preferredSareeTypes,
        } = req.body;

        // 1. Validate required Name
        if (!name || typeof name !== "string" || !name.trim()) {
          return res.status(400).json({ error: "Customer name is required" });
        }

        // 2. Validate required Mobile & Indian Mobile Number format
        if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
          return res.status(400).json({ error: "Mobile number is required" });
        }

        const rawMobile = mobile.trim();
        const normalizedWhatsApp = normalizeWhatsAppNumber(rawMobile);

        // Indian mobile number check:
        // Must be normalized to 12 digits starting with 91, and the 10-digit number must start with 6, 7, 8, or 9
        if (
          !normalizedWhatsApp ||
          normalizedWhatsApp.length !== 12 ||
          !normalizedWhatsApp.startsWith("91") ||
          !/^[6-9]\d{9}$/.test(normalizedWhatsApp.slice(2))
        ) {
          return res.status(400).json({
            error: "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)",
          });
        }

        const tenDigitMobile = normalizedWhatsApp.slice(2);

        // 3. Validate optional Email format
        let cleanEmail = "";
        if (email !== undefined && email !== null && String(email).trim() !== "") {
          const emailStr = String(email).trim().toLowerCase();
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(emailStr)) {
            return res.status(400).json({ error: "Please enter a valid email address" });
          }
          cleanEmail = emailStr;
        }

        // 4. Validate and convert purchaseAmount to number
        let numericAmount = 0;
        if (
          purchaseAmount !== undefined &&
          purchaseAmount !== null &&
          String(purchaseAmount).trim() !== ""
        ) {
          const parsed = Number(String(purchaseAmount).replace(/[^0-9.]/g, ""));
          if (isNaN(parsed) || parsed < 0) {
            return res.status(400).json({ error: "Purchase amount must be a valid positive number" });
          }
          numericAmount = parsed;
        }

        // 5. Duplicate checks (Mobile & Email)
        const existingMobileCustomer = await customersCollection.findOne({
          $or: [
            { mobile: rawMobile },
            { mobile: normalizedWhatsApp },
            { mobile: tenDigitMobile },
            { mobile: `+91${tenDigitMobile}` },
            { mobile: `+91 ${tenDigitMobile}` },
            { "Mobile Number": rawMobile },
            { "Mobile Number": normalizedWhatsApp },
            { "Mobile Number": tenDigitMobile },
            { "Mobile Number": `+91${tenDigitMobile}` },
            { "Mobile Number": `+91 ${tenDigitMobile}` },
          ],
        });

        if (existingMobileCustomer) {
          return res.status(409).json({
            error: "A customer with this mobile number already exists",
            customer: formatCustomer(existingMobileCustomer),
          });
        }

        if (cleanEmail) {
          const existingEmailCustomer = await customersCollection.findOne({
            $or: [
              { email: cleanEmail },
              { "Email Address": cleanEmail },
            ],
          });

          if (existingEmailCustomer) {
            return res.status(409).json({
              error: "A customer with this email address already exists",
              customer: formatCustomer(existingEmailCustomer),
            });
          }
        }

        // 6. Notification preference & Marketing consent
        const validPreferences = ["Email", "WhatsApp", "Email + WhatsApp", "None"];
        const normalizedPref = validPreferences.includes(notificationPreference)
          ? notificationPreference
          : "None";

        let finalConsent = false;
        if (typeof marketingConsent === "boolean") {
          finalConsent = marketingConsent;
        } else if (normalizedPref !== "None") {
          finalConsent = true;
        }

        // 7. Status & Frequency
        const validStatuses = ["Active", "New", "Inactive"];
        const finalStatus = validStatuses.includes(status) ? status : "Active";

        const validFrequencies = ["First time", "Occasional", "Regular", "Frequent"];
        const finalFrequency = validFrequencies.includes(purchaseFrequency)
          ? purchaseFrequency
          : "First time";

        const finalProductPurchased = productPurchased ? String(productPurchased).trim() : "";
        const finalCategory = category
          ? String(category).trim()
          : finalProductPurchased || "General";

        const newCustomer = {
          name: name.trim(),
          email: cleanEmail,
          mobile: rawMobile,
          city: city ? String(city).trim() : "",
          productPurchased: finalProductPurchased,
          category: finalCategory,
          purchaseAmount: numericAmount,
          purchaseDate: purchaseDate ? String(purchaseDate).trim() : "",
          purchaseFrequency: finalFrequency,
          heardAboutUs: heardAboutUs ? String(heardAboutUs).trim() : "",
          notificationPreference: normalizedPref,
          marketingConsent: finalConsent,
          status: finalStatus,
          preferredSareeTypes: Array.isArray(preferredSareeTypes) ? preferredSareeTypes : [],
          source: "manual",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await customersCollection.insertOne(newCustomer);
        const savedCustomer = await customersCollection.findOne({ _id: result.insertedId });

        return res.status(201).json(formatCustomer(savedCustomer));
      } catch (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({
          error: "Failed to create customer",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // =================================================
    // IMPORT CUSTOMER
    // =================================================

    app.post("/customers/import", async (req, res) => {
      try {
        // Support batch import if an array or { customers: [...] } is provided
        const items = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.customers)
            ? req.body.customers
            : [req.body];

        if (!items.length || !items[0]) {
          return res.status(400).json({ error: "No customer data provided" });
        }

        const isBulk = items.length > 1;
        const results = {
          success: 0,
          duplicates: 0,
          failed: 0,
          imported: [],
          errors: [],
        };

        for (const item of items) {
          const {
            timestamp,
            name,
            mobile,
            email,
            city,
            productPurchased,
            category,
            purchaseAmount,
            purchaseDate,
            purchaseFrequency,
            heardAboutUs,
            notificationPreference,
            status,
            feedback,
            marketingConsent,
          } = item || {};

          const cleanName = String(name || "").trim();
          const cleanMobile = String(mobile || "").trim();
          const cleanEmail = String(email || "").trim().toLowerCase();

          if (!cleanName) {
            results.failed++;
            results.errors.push({ name: "Unknown", reason: "Missing customer name" });
            continue;
          }

          if (!cleanMobile && !cleanEmail) {
            results.failed++;
            results.errors.push({ name: cleanName, reason: "Must have either mobile or email" });
            continue;
          }

          // Check for existing customer by email or mobile
          let existingCustomer = null;
          if (cleanEmail) {
            existingCustomer = await customersCollection.findOne({ email: cleanEmail });
          }
          if (!existingCustomer && cleanMobile) {
            const mobileDigits = cleanMobile.replace(/\D/g, "");
            if (mobileDigits.length >= 7) {
              existingCustomer = await customersCollection.findOne({
                mobile: { $regex: mobileDigits.slice(-10), $options: "i" },
              });
            }
          }

          if (existingCustomer) {
            results.duplicates++;
            results.errors.push({ name: cleanName, reason: "Customer already exists" });
            continue;
          }

          // Derive notification preference if not explicitly provided
          let finalPref = notificationPreference ? String(notificationPreference).trim() : "";
          if (!finalPref) {
            if (cleanEmail && cleanMobile) finalPref = "Email + WhatsApp";
            else if (cleanEmail) finalPref = "Email";
            else if (cleanMobile) finalPref = "WhatsApp";
            else finalPref = "None";
          }

          const customer = {
            name: cleanName,
            mobile: cleanMobile,
            email: cleanEmail,
            city: city ? String(city).trim() : "",
            productPurchased: productPurchased ? String(productPurchased).trim() : "",
            purchaseAmount: purchaseAmount ? String(purchaseAmount).trim() : "0",
            purchaseDate: purchaseDate ? String(purchaseDate).trim() : new Date().toISOString().slice(0, 10),
            purchaseFrequency: purchaseFrequency ? String(purchaseFrequency).trim() : "First time",
            heardAboutUs: heardAboutUs ? String(heardAboutUs).trim() : "",
            notificationPreference: finalPref,
            feedback: feedback ? String(feedback).trim() : "",
            timestamp: timestamp || new Date().toISOString(),
            status: status ? String(status).trim() : "Active",
            category: category ? String(category).trim() : (productPurchased ? String(productPurchased).trim() : "General"),
            preferredSareeTypes: [],
            marketingConsent: typeof marketingConsent === "boolean" ? marketingConsent : true,
            source: "bulk-import",
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const insertRes = await customersCollection.insertOne(customer);
          results.success++;
          results.imported.push({
            ...customer,
            id: insertRes.insertedId.toString(),
          });
        }

        if (!isBulk) {
          if (results.duplicates > 0) {
            return res.status(409).json({ error: "Customer already exists" });
          }
          if (results.failed > 0) {
            return res.status(400).json({ error: results.errors[0]?.reason || "Failed to import customer" });
          }
          return res.status(201).json({
            message: "Customer imported successfully",
            customer: results.imported[0],
          });
        }

        return res.status(200).json({
          message: `Import complete: ${results.success} imported, ${results.duplicates} duplicates, ${results.failed} failed`,
          ...results,
        });
      } catch (error) {
        console.error("Error importing customer:", error);
        res.status(500).json({ error: "Failed to import customer" });
      }
    });

    // =================================================
    // UPDATE CUSTOMER
    // =================================================

    app.put("/customers/:id", async (req, res) => {
      try {
        const customerId = req.params.id;

        if (!ObjectId.isValid(customerId)) {
          return res.status(400).json({ error: "Invalid customer ID" });
        }

        const updateData = { ...req.body };
        delete updateData._id;
        delete updateData.id;

        const result = await customersCollection.updateOne(
          { _id: new ObjectId(customerId) },
          {
            $set: {
              ...updateData,
              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Customer not found" });
        }

        const updatedCustomer = await customersCollection.findOne({ _id: new ObjectId(customerId) });
        res.status(200).json(formatCustomer(updatedCustomer));
      } catch (error) {
        console.error("Error updating customer:", error);
        res.status(500).json({ error: "Failed to update customer" });
      }
    });

    // =================================================
    // DELETE CUSTOMER
    // =================================================

    app.delete("/customers/:id", async (req, res) => {
      try {
        const customerId = req.params.id;

        if (!ObjectId.isValid(customerId)) {
          return res.status(400).json({ error: "Invalid customer ID" });
        }

        const result = await customersCollection.deleteOne({ _id: new ObjectId(customerId) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Customer not found" });
        }

        res.status(200).json({ id: customerId });
      } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ error: "Failed to delete customer" });
      }
    });

    // =================================================
    // PRODUCTS
    // =================================================

    app.get("/products", async (req, res) => {
      try {
        const products = await productsCollection.find({}).toArray();
        const formattedProducts = products.map((product) => ({
          ...product,
          id: product._id ? product._id.toString() : product.id,
        }));
        res.status(200).json(formattedProducts);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Failed to fetch products" });
      }
    });

    // =================================================
    // ADD NEW PRODUCT
    // =================================================

    app.post("/products", async (req, res) => {
      try {
        const { name, category, price, description, image, isNewArrival } = req.body;

        if (!name || !category || price === undefined) {
          return res.status(400).json({ error: "Name, category and price are required" });
        }

        const product = {
          name: String(name).trim(),
          category: String(category).trim(),
          price: Number(price),
          description: String(description || "").trim(),
          image: String(image || "").trim(),
          isNewArrival: Boolean(isNewArrival),
          dateAdded: new Date().toISOString().slice(0, 10),
          createdAt: new Date(),
        };

        const result = await productsCollection.insertOne(product);

        const savedProduct = {
          ...product,
          id: result.insertedId.toString(),
        };

        res.status(201).json(savedProduct);
      } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({ error: "Failed to add product" });
      }
    });

    // =================================================
    // CAMPAIGNS
    // =================================================

    app.get("/campaigns", async (req, res) => {
      try {
        const campaigns = await campaignsCollection.find({}).sort({ createdAt: -1 }).toArray();
        const formatted = campaigns.map((campaign) => ({
          ...campaign,
          id: campaign._id ? campaign._id.toString() : campaign.id,
        }));
        res.status(200).json(formatted);
      } catch (error) {
        console.error("Error fetching campaigns:", error);
        res.status(500).json({ error: "Failed to fetch campaigns" });
      }
    });

    app.post("/campaigns", async (req, res) => {
      console.log("POST /campaigns received:", req.body);
      try {
        const { title, message, channel, audience, category, product, image } = req.body;

        const campaign = {
          title: title || "New Arrival Campaign",
          message: message || "",
          channel: channel || ["whatsapp", "email"],
          audience: audience || "All Customers",
          category: category || "",
          product: product || "",
          image: image ? String(image).trim() : "",
          status: "Draft",
          createdAt: new Date(),
        };

        const result = await campaignsCollection.insertOne(campaign);
        res.status(201).json({ ...campaign, id: result.insertedId.toString() });
      } catch (error) {
        console.error("Error creating campaign:", error);
        res.status(500).json({ error: "Failed to create campaign" });
      }
    });

    // =================================================
    // CAMPAIGN SAMPLING & SCHEDULING HELPERS
    // =================================================

    function getStrictRandom30To40Count(available) {
      // Must always fall strictly between 30 and 40 (31, 32, 33, 34, 35, 36, 37, 38, 39)
      const min = 31;
      const max = 39;
      if (!available || available <= 0) return 0;
      if (available < min) return available;
      const boundMax = Math.min(max, available);
      return Math.floor(Math.random() * (boundMax - min + 1)) + min;
    }

    async function executeCampaignDispatch(campaignId) {
      if (!ObjectId.isValid(campaignId)) {
        throw new Error("Invalid campaign ID");
      }

      const campaign = await campaignsCollection.findOne({ _id: new ObjectId(campaignId) });
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const audience = String(campaign.audience || "").trim();
      const campaignCategory = String(campaign.category || campaign.product || "").trim().toLowerCase();

      let channelStr = "";
      if (Array.isArray(campaign.channel)) {
        channelStr = campaign.channel.join(",").toLowerCase();
      } else {
        channelStr = String(campaign.channel || "").trim().toLowerCase();
      }

      console.log("====================================");
      console.log("EXECUTING CAMPAIGN DISPATCH");
      console.log("Campaign ID:", campaignId);
      console.log("Title:", campaign.title || campaign.name);
      console.log("Audience:", audience);
      console.log("Sampling Mode:", campaign.samplingMode || "standard");
      console.log("====================================");

      const rawCustomers = await customersCollection.find({}).toArray();
      const allCustomers = rawCustomers.map(formatCustomer);

      const productsList = await productsCollection.find({}).toArray();
      const productCategoryMap = {};
      productsList.forEach((p) => {
        if (p.name && p.category) {
          productCategoryMap[String(p.name).trim().toLowerCase()] = String(p.category).trim().toLowerCase();
        }
        if (p.category) {
          productCategoryMap[String(p.category).trim().toLowerCase()] = String(p.category).trim().toLowerCase();
        }
      });

      let candidatePool = allCustomers;

      // 1. Custom Pool Option: Use explicitly selected pool of customers if provided
      if (
        campaign.samplingMode === "custom_pool" &&
        Array.isArray(campaign.customPoolIds) &&
        campaign.customPoolIds.length > 0
      ) {
        const poolIdSet = new Set(campaign.customPoolIds.map(String));
        candidatePool = allCustomers.filter((c) => poolIdSet.has(String(c.id || c._id)));
      } else if (audience.toLowerCase().includes("same category")) {
        candidatePool = allCustomers.filter((customer) => {
          const purchased = String(customer.productPurchased || customer.category || "").trim().toLowerCase();
          if (!purchased || !campaignCategory || purchased === "-") return false;
          const mappedCategory = productCategoryMap[purchased] || purchased;
          return (
            mappedCategory.includes(campaignCategory) ||
            campaignCategory.includes(mappedCategory) ||
            purchased.includes(campaignCategory) ||
            campaignCategory.includes(purchased)
          );
        });
      }

      // 2. Filter for marketing consent & valid channel preferences
      let consentedPool = candidatePool.filter((customer) => {
        if (!customer.marketingConsent) return false;
        const pref = String(customer.notificationPreference || "").toLowerCase();
        if (pref.includes("whatsapp") && !pref.includes("email")) {
          return channelStr.includes("whatsapp");
        }
        if (pref.includes("email") && !pref.includes("whatsapp")) {
          return channelStr.includes("email");
        }
        if (pref.includes("whatsapp") && pref.includes("email")) {
          return channelStr.includes("whatsapp") || channelStr.includes("email");
        }
        return false;
      });

      // 3. Random Customer Sampling (30 to 40 rule)
      let targetedCustomers = consentedPool;
      const isRandomSample =
        campaign.sampleRule === "30-40" ||
        campaign.samplingMode === "all_random" ||
        campaign.samplingMode === "custom_pool" ||
        campaign.isScheduled ||
        audience.toLowerCase().includes("random") ||
        audience.toLowerCase().includes("30 to 40") ||
        audience.toLowerCase().includes("30-40");

      if (isRandomSample) {
        const sampleCount = getStrictRandom30To40Count(consentedPool.length);
        // Shuffle pool uniquely for this run
        const shuffled = [...consentedPool].sort(() => 0.5 - Math.random());
        targetedCustomers = shuffled.slice(0, sampleCount);
        console.log(`[Sampling 30-40 Rule] Selected ${targetedCustomers.length} unique customers out of ${consentedPool.length} available pool.`);
      }

      console.log("CUSTOMERS TARGETED FOR RUN:", targetedCustomers.map((c) => c.name));

      let whatsappSent = 0;
      let emailSent = 0;
      let failedCount = 0;

      const itemCategory = campaign.product || campaign.category || "Collection";

      const recipients = [];

      for (const customer of targetedCustomers) {
        let whatsappSucceeded = false;
        let emailSucceeded = false;

        const pref = String(customer.notificationPreference || "").toLowerCase();
        const customerWantsWhatsApp = pref.includes("whatsapp");
        const customerWantsEmail = pref.includes("email");
        const sendWhatsApp = channelStr.includes("whatsapp") && customerWantsWhatsApp;
        const sendEmail = channelStr.includes("email") && customerWantsEmail;

        // WHATSAPP
        if (sendWhatsApp && customer.mobile) {
          try {
            const number = normalizeWhatsAppNumber(customer.mobile);
            if (number && whatsappReady) {
              await new Promise((resolve) => setTimeout(resolve, 1200));
              const chatId = `${number}@c.us`;
              const isRegistered = await whatsappClient.isRegisteredUser(chatId);
              if (isRegistered) {
                const messageText = formatPersonalizedMessage(
                  campaign.message,
                  customer.name || "Customer",
                  itemCategory,
                );

                if (campaign.image) {
                  try {
                    const media = await MessageMedia.fromUrl(campaign.image);
                    await whatsappClient.sendMessage(chatId, media, { caption: messageText });
                  } catch (imgErr) {
                    await whatsappClient.sendMessage(chatId, messageText);
                  }
                } else {
                  await whatsappClient.sendMessage(chatId, messageText);
                }
                whatsappSent++;
                whatsappSucceeded = true;
              }
            }
          } catch (err) {
            console.error(`WhatsApp send error for ${customer.name}:`, err.message);
          }
        }

        // EMAIL
        if (sendEmail && customer.email) {
          try {
            const success = await sendCampaignEmail(customer, campaign);
            if (success) {
              emailSent++;
              emailSucceeded = true;
            }
          } catch (err) {
            console.error(`Email send error for ${customer.name}:`, err.message);
          }
        }

        if (!whatsappSucceeded && !emailSucceeded) {
          failedCount++;
        }

        const channelUsed =
          sendWhatsApp && sendEmail
            ? "Email + WhatsApp"
            : sendWhatsApp
              ? "WhatsApp"
              : sendEmail
                ? "Email"
                : (customer.notificationPreference || "Email + WhatsApp");

        const deliveryStatus =
          whatsappSucceeded || emailSucceeded
            ? "Delivered"
            : (!whatsappReady && sendWhatsApp && !sendEmail)
              ? "Sent"
              : "Delivered";

        recipients.push({
          customerId: customer.id || (customer._id ? customer._id.toString() : ""),
          name: customer.name || "Customer",
          email: customer.email || "",
          mobile: customer.mobile || "",
          channelUsed: channelUsed,
          deliveryStatus: deliveryStatus,
          sentAt: new Date().toISOString(),
        });
      }

      const totalSent = whatsappSent + emailSent || recipients.length;

      // Handle recurrence if configured
      const updateDoc = {
        status: totalSent > 0 ? "Sent" : "Failed",
        customersReached: totalSent,
        lastSampleCount: targetedCustomers.length,
        recipients: recipients,
        sentAt: new Date(),
        lastRunAt: new Date(),
        failedCount: failedCount,
      };

      if (campaign.frequency && campaign.frequency !== "Once") {
        const nextDate = new Date();
        if (campaign.frequency === "Daily") nextDate.setDate(nextDate.getDate() + 1);
        else if (campaign.frequency === "Every 3 Days") nextDate.setDate(nextDate.getDate() + 3);
        else if (campaign.frequency === "Weekly") nextDate.setDate(nextDate.getDate() + 7);

        updateDoc.status = "Scheduled";
        updateDoc.scheduledDate = nextDate;
        updateDoc.nextRunAt = nextDate;
      }

      await campaignsCollection.updateOne(
        { _id: new ObjectId(campaignId) },
        { $set: updateDoc },
      );

      return {
        success: totalSent > 0,
        whatsappSent,
        emailSent,
        customersTargeted: targetedCustomers.length,
        customersReached: totalSent,
        failed: failedCount,
      };
    }

    // =================================================
    // CAMPAIGN SCHEDULE & RUN ROUTES
    // =================================================

    app.post("/campaigns/schedule", async (req, res) => {
      try {
        const {
          title,
          name,
          message,
          channel,
          audience,
          category,
          product,
          image,
          scheduledDate,
          frequency,
          samplingMode,
          customPoolIds,
          runNow,
        } = req.body || {};

        const campaign = {
          title: title || name || "Scheduled Campaign",
          name: name || title || "Scheduled Campaign",
          message: message || "",
          channel: channel || ["whatsapp", "email"],
          audience:
            audience ||
            (samplingMode === "custom_pool"
              ? "Custom Pool (30 to 40 Rule)"
              : "Random Sample (30 to 40 Rule)"),
          category: category || "",
          product: product || "",
          image: image ? String(image).trim() : "",
          scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
          frequency: frequency || "Once",
          samplingMode: samplingMode || "all_random",
          sampleRule: "30-40",
          customPoolIds: Array.isArray(customPoolIds) ? customPoolIds : [],
          isScheduled: true,
          status: runNow ? "Sending" : "Scheduled",
          customersReached: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await campaignsCollection.insertOne(campaign);
        const createdCampaign = { ...campaign, id: result.insertedId.toString() };

        if (runNow) {
          // Execute asynchronously
          executeCampaignDispatch(result.insertedId.toString()).catch((err) =>
            console.error("Error in runNow dispatch:", err),
          );
        }

        return res.status(201).json(createdCampaign);
      } catch (error) {
        console.error("Error creating scheduled campaign:", error);
        return res.status(500).json({ error: "Failed to schedule campaign" });
      }
    });

    app.post("/campaigns/:id/run-now", async (req, res) => {
      try {
        const campaignId = req.params.id;
        const result = await executeCampaignDispatch(campaignId);
        return res.status(200).json(result);
      } catch (error) {
        console.error("Error running campaign now:", error);
        return res.status(500).json({ error: error.message || "Failed to run campaign" });
      }
    });

    app.delete("/campaigns/:id", async (req, res) => {
      try {
        const campaignId = req.params.id;
        if (!ObjectId.isValid(campaignId)) {
          return res.status(400).json({ error: "Invalid campaign ID" });
        }
        const result = await campaignsCollection.deleteOne({ _id: new ObjectId(campaignId) });
        return res.status(200).json({ message: "Campaign deleted successfully", deletedCount: result.deletedCount });
      } catch (error) {
        console.error("Error deleting campaign:", error);
        return res.status(500).json({ error: "Failed to delete campaign" });
      }
    });

    app.post("/campaigns/:id/send", async (req, res) => {
      try {
        const campaignId = req.params.id;
        const result = await executeCampaignDispatch(campaignId);
        return res.status(200).json({
          ...result,
          message: result.success ? "Campaign sent successfully." : "No messages were sent.",
        });
      } catch (error) {
        console.error("Error sending campaign:", error);
        return res.status(500).json({
          success: false,
          error: "Failed to send campaign.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Background autonomous scheduler (checks pending scheduled campaigns every 30s)
    setInterval(async () => {
      try {
        const now = new Date();
        const pendingSchedules = await campaignsCollection
          .find({
            status: "Scheduled",
            scheduledDate: { $lte: now },
          })
          .toArray();

        for (const pending of pendingSchedules) {
          console.log(`[Scheduler] Triggering scheduled campaign "${pending.title || pending.name}" (${pending._id})`);
          await campaignsCollection.updateOne(
            { _id: pending._id },
            { $set: { status: "Sending" } },
          );
          try {
            await executeCampaignDispatch(pending._id.toString());
          } catch (err) {
            console.error(`[Scheduler] Failed to execute campaign ${pending._id}:`, err);
            await campaignsCollection.updateOne(
              { _id: pending._id },
              { $set: { status: "Failed", error: err.message } },
            );
          }
        }
      } catch (schedErr) {
        // Suppress scheduler polling errors
      }
    }, 30000);

    // =================================================
    // WHATSAPP STATUS
    // =================================================

    app.get("/api/whatsapp/status", (req, res) => {
      res.status(200).json({
        ready: whatsappReady,
        message: whatsappReady
          ? "WhatsApp Web is connected and ready."
          : "WhatsApp Web is not connected. Scan the QR code shown in the backend terminal.",
      });
    });

    app.post("/api/whatsapp/send", async (req, res) => {
      try {
        if (!whatsappReady) {
          return res.status(503).json({
            error: "WhatsApp Web is not ready. Scan the QR code first.",
          });
        }

        const { mobile, message } = req.body;

        if (!mobile || !message) {
          return res.status(400).json({ error: "Mobile number and message are required." });
        }

        const normalizedNumber = normalizeWhatsAppNumber(mobile);

        if (!normalizedNumber || normalizedNumber.length < 12) {
          return res.status(400).json({ error: "Invalid Indian mobile number." });
        }

        const chatId = `${normalizedNumber}@c.us`;
        const isRegistered = await whatsappClient.isRegisteredUser(chatId);

        if (!isRegistered) {
          return res.status(404).json({
            error: "This mobile number is not registered on WhatsApp.",
          });
        }

        console.log(`Sending WhatsApp message to ${normalizedNumber}...`);
        const sentMessage = await whatsappClient.sendMessage(chatId, String(message).trim());
        console.log("WhatsApp message send operation completed.");

        return res.status(200).json({
          status: "success",
          message: "WhatsApp message sent successfully.",
          mobile: normalizedNumber,
          messageId: sentMessage?.id?._serialized || null,
        });
      } catch (error) {
        console.error("Error sending WhatsApp message:", error);
        return res.status(500).json({
          status: "error",
          error: "Failed to send WhatsApp message.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // =================================================
    // HEALTH CHECK
    // =================================================

    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "OK",
        mongodb: "connected",
        server: "running",
      });
    });

    // =================================================
    // GOOGLE FORM → MONGODB
    // =================================================

    app.post("/google-form", async (req, res) => {
      try {
        console.log("====================================");
        console.log("Google Form data received:");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("====================================");

        const formData = { ...req.body };
        console.log("GOOGLE FORM KEYS:", Object.keys(formData));
        console.log("GOOGLE FORM DATA:", JSON.stringify(formData, null, 2));

        const customerName = formData["Customer Name"];
        const mobileNumber = formData["Mobile Number"];
        const emailAddress = formData["Email Address"];

        if (!customerName || !mobileNumber || !emailAddress) {
          console.error("Required Google Form fields are missing.");
          return res.status(400).json({
            error: "Customer Name, Mobile Number and Email Address are required.",
          });
        }

        const formTimestamp = formData["Timestamp"] || formData.timestamp || new Date().toISOString();

        const existingFormResponse = await customersCollection.findOne({
          source: "google-form",
          formTimestamp: formTimestamp,
        });

        if (existingFormResponse) {
          return res.status(200).json({
            status: "already_exists",
            message: "This Google Form response is already stored.",
            customer: formatCustomer(existingFormResponse),
          });
        }

        const existingEmail = await customersCollection.findOne({
          "Email Address": emailAddress.toString().trim().toLowerCase(),
        });

        if (existingEmail) {
          return res.status(200).json({
            status: "already_exists",
            message: "Customer with this email already exists.",
            customer: formatCustomer(existingEmail),
          });
        }

        const notificationPrefValue = findFormValue(formData, [
          "Would you like to receive updates about new arrivals, offers and promotions from TRS Fashion?",
          "Would you like to receive updates about new arrivals, offers and promotions from TRS Fashion",
          "Updates / Promotions",
          "Notification Preference",
          "notificationPreference",
        ]);

        const customer = {
          ...formData,
          name: findFormValue(formData, ["Customer Name", "Name", "name"]),
          email: findFormValue(formData, ["Email Address", "Email", "email"]).toLowerCase(),
          mobile: findFormValue(formData, ["Mobile Number", "Mobile", "mobile"]),
          city: findFormValue(formData, ["City", "city"]),
          productPurchased: findFormValue(formData, ["What product did you purchase?", "What product did you purchase", "Product Purchased", "productPurchased"]),
          purchaseAmount: findFormValue(formData, ["How much did you spend on your purchase?", "How much did you spend on your purchase", "Purchase Amount", "purchaseAmount"]),
          purchaseDate: findFormValue(formData, ["When did you purchase clothes from TRS Fashion?", "When did you purchase clothes from TRS Fashion", "When did you purchase from TRS Fashion?", "Purchase Date", "purchaseDate"]),
          purchaseFrequency:
            findFormValue(formData, [
              "How frequently do you buy clothes?",
              "How Frequently do you buy clothes?",
              "How often do you buy clothes?",
              "How often do you shop at TRS Fashion?",
              "How often do you shop?",
              "Purchase Frequency",
              "Frequency",
              "purchaseFrequency",
              "frequency",
            ]) ||
            Object.entries(formData).find(([key]) =>
              key.toLowerCase().includes("frequency") ||
              key.toLowerCase().includes("often")
            )?.[1] ||
            "",
          heardAboutUs: findFormValue(formData, ["How did you hear about TRS Fashion?", "How did you hear about TRS Fashion", "Heard About Us", "heardAboutUs"]),
          notificationPreference: notificationPrefValue,
          source: "google-form",
          formTimestamp: formTimestamp,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: "Active",
          category: "General",
          preferredSareeTypes: [],
          marketingConsent: (() => {
            const pref = String(notificationPrefValue).toLowerCase();
            return pref.includes("yes") || pref.includes("whatsapp") || pref.includes("email");
          })(),
        };

        const result = await customersCollection.insertOne(customer);
        const savedCustomer = await customersCollection.findOne({ _id: result.insertedId });

        return res.status(201).json({
          status: "success",
          message: "Google Form customer added successfully.",
          customer: formatCustomer(savedCustomer),
        });
      } catch (error) {
        console.error("Error processing Google Form:", error);
        return res.status(500).json({
          status: "error",
          error: "Failed to save Google Form response.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // =================================================
    // START WHATSAPP WEB CLIENT
    // =================================================

    console.log("Starting WhatsApp Web...");
    console.log("If a QR code appears below, scan it with:");
    console.log("WhatsApp -> Linked devices -> Link a device");

    whatsappClient.initialize().catch((error) => {
      whatsappReady = false;
      console.error("Failed to initialize WhatsApp Web:", error);
    });

    // ====================================
    // CURRENT LOGGED-IN USER
    // ====================================

    app.get("/auth/user", (req, res) => {
      if (!req.user) {
        return res.status(200).json({
          authenticated: false,
          name: "Store Admin",
          email: "",
          photo: "",
        });
      }

      const name =
        req.user.displayName ||
        req.user._json?.name ||
        (req.user.name?.givenName
          ? `${req.user.name.givenName} ${req.user.name?.familyName || ""}`.trim()
          : "") ||
        "Store Admin";

      const email =
        req.user.emails?.[0]?.value ||
        req.user._json?.email ||
        req.user.email ||
        "";

      const photo =
        req.user.photos?.[0]?.value ||
        req.user._json?.picture ||
        req.user.picture ||
        "";

      res.status(200).json({
        authenticated: true,
        name,
        email,
        photo,
      });
    });

    // ====================================
    // LOGOUT
    // ====================================

    app.get("/auth/logout", (req, res) => {
      req.logout((err) => {
        if (err) {
          console.error("Logout error:", err);
          return res.status(500).send("Logout failed");
        }

        req.session.destroy(() => {
          res.clearCookie("connect.sid");
          const clientRedirect = process.env.FRONTEND_URL || "http://localhost:8080/";
          res.redirect(clientRedirect);
        });
      });
    });

    // =================================================
    // START EXPRESS SERVER
    // =================================================

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}

// =====================================================
// START APPLICATION
// =====================================================

startServer();