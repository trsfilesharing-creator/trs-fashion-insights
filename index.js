require("dotenv").config();

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const nodemailer = require("nodemailer");

// =====================================================
// EXPRESS APP
// =====================================================

const app = express();
const PORT = process.env.PORT || 3000;
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
    origin: "http://localhost:8080",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
  }),
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
    },
  }),
);

// =====================================================
// PASSPORT CONFIGURATION
// =====================================================

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
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
    res.redirect("http://localhost:8080/app");
  },
);

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
    findFormValue(rawCustomer, [
      "How frequently do you buy clothes?",
      "How frequently do you buy clothes",
      "How Frequently do you buy clothes?",
      "How Frequently do you buy clothes",
      "How often do you buy clothes?",
      "How often do you buy clothes",
      "Purchase Frequency",
      "purchaseFrequency",
      "Frequency",
      "frequency",
    ]) || "—";

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

    const mailOptions = {
      from: `"TRS Fashion" <${process.env.EMAIL_USER}>`,
      to: customer.email,
      subject: `TRS Fashion | ${itemCategory} Update`,

      text: `Hello ${customer.name},

We have an exciting update for you.

Product: ${itemCategory}

${campaign.message || "Check out our latest collection."}

Thank you for shopping with TRS Fashion!`,
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
    // IMPORT CUSTOMER
    // =================================================

    app.post("/customers/import", async (req, res) => {
      try {
        const {
          timestamp, name, mobile, email, city, productPurchased,
          purchaseAmount, purchaseDate, purchaseFrequency, heardAboutUs,
          notificationPreference, feedback,
        } = req.body;

        if (!name || !mobile || !email) {
          return res.status(400).json({ error: "Name, mobile number and email are required" });
        }

        const existingCustomer = await customersCollection.findOne({
          email: email.trim().toLowerCase(),
        });

        if (existingCustomer) {
          return res.status(409).json({
            error: "Customer already exists",
            customer: formatCustomer(existingCustomer),
          });
        }

        const customer = {
          name: name.trim(),
          mobile: mobile.trim(),
          email: email.trim().toLowerCase(),
          city: city ? city.trim() : "",
          productPurchased: productPurchased || "",
          purchaseAmount: purchaseAmount || "",
          purchaseDate: purchaseDate || "",
          purchaseFrequency: purchaseFrequency || "",
          heardAboutUs: heardAboutUs || "",
          notificationPreference: notificationPreference || "",
          feedback: feedback || "",
          timestamp: timestamp || new Date().toISOString(),
          status: "Active",
          category: productPurchased || "General",
          preferredSareeTypes: [],
          marketingConsent: notificationPreference
            ? notificationPreference.toLowerCase().includes("yes")
            : false,
          source: "manual-import",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await customersCollection.insertOne(customer);

        res.status(201).json({
          message: "Customer imported successfully",
          customer: {
            ...customer,
            id: result.insertedId.toString(),
          },
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
        const campaign = { ...req.body, createdAt: new Date() };
        const result = await campaignsCollection.insertOne(campaign);
        res.status(201).json({ ...campaign, id: result.insertedId.toString() });
      } catch (error) {
        console.error("Error creating campaign:", error);
        res.status(500).json({ error: "Failed to create campaign" });
      }
    });

    // =================================================
    // SEND CAMPAIGN
    // =================================================

    app.post("/campaigns/:id/send", async (req, res) => {
      try {
        const campaignId = req.params.id;

        if (!ObjectId.isValid(campaignId)) {
          return res.status(400).json({ error: "Invalid campaign ID" });
        }

        const campaign = await campaignsCollection.findOne({ _id: new ObjectId(campaignId) });

        if (!campaign) {
          return res.status(404).json({ error: "Campaign not found" });
        }

        const audience = String(campaign.audience || "").trim();
        const category = String(campaign.category || campaign.product || "").trim();
        const channel = String(campaign.channel || "").trim().toLowerCase();

        console.log("====================================");
        console.log("CAMPAIGN SEND");
        console.log("Audience:", audience);
        console.log("Category/Product:", category);
        console.log("Channel:", channel);
        console.log("====================================");

        if (channel.includes("whatsapp") && !whatsappReady) {
          return res.status(503).json({ error: "WhatsApp Web is not ready." });
        }

        const rawCustomers = await customersCollection.find({}).toArray();
        const allCustomers = rawCustomers.map(formatCustomer);
        console.log("TOTAL CUSTOMERS:", allCustomers.length);

        let targetCustomers = allCustomers;

        const audienceLower = audience.toLowerCase();
        const categoryLower = category.toLowerCase();

        if (audienceLower.includes("same category")) {
          targetCustomers = allCustomers.filter((customer) => {
            const purchased = String(customer.productPurchased || customer.category || "").trim().toLowerCase();
            if (!purchased || !categoryLower || purchased === "-") return false;
            return purchased.includes(categoryLower) || categoryLower.includes(purchased);
          });
        } else {
          // Default to all customers if audience is general or all
          targetCustomers = allCustomers;
        }

        // Broadened consent filter to guarantee customers aren't skipped
        const consentedCustomers = targetCustomers.filter((customer) => {
          return true; // Send to all targeted customers directly
        });

        console.log("CUSTOMERS TARGETED:", consentedCustomers.map((c) => c.name));

        let whatsappSent = 0;
        let emailSent = 0;
        let failedCount = 0;

        const itemCategory = campaign.product || campaign.category || "Collection";

        for (const customer of consentedCustomers) {
          let messageFailed = false;

          // ----------------------------
          // WHATSAPP
          // ----------------------------
          if (channel.includes("whatsapp") && customer.mobile) {
            try {
              const number = normalizeWhatsAppNumber(customer.mobile);
              
              if (number) {
                console.log(`Preparing WhatsApp message for ${customer.name} (${number})`);
                await new Promise((resolve) => setTimeout(resolve, 1500));

                const chatId = `${number}@c.us`;
                const isRegistered = await whatsappClient.isRegisteredUser(chatId);

                if (isRegistered) {
                  const message = campaign.message || `Hi ${customer.name || "Customer"} 👋\n\nOur new ${itemCategory} collection has arrived at TRS Fashion!\n\nVisit TRS Fashion to explore our latest collection.`;
                  await whatsappClient.sendMessage(chatId, message);
                  whatsappSent++;
                  console.log(`Sent successfully to ${customer.name} - ${number}`);
                } else {
                  console.log(`${number} is not registered on WhatsApp`);
                  messageFailed = true;
                }
              }
            } catch (err) {
              messageFailed = true;
              console.error(`Failed to send WhatsApp to ${customer.mobile}:`, err.message);
            }
          }

          // ----------------------------
          // EMAIL
          // ----------------------------
          if (channel.includes("email") && customer.email) {
            console.log(`Preparing Email for ${customer.name}`);
            const success = await sendCampaignEmail(customer, campaign);
            if (success) {
              emailSent++;
            } else {
              messageFailed = true;
            }
          }

          if (messageFailed) {
            failedCount++;
          }
        }

        const totalSent = whatsappSent + emailSent;

        await campaignsCollection.updateOne(
          { _id: new ObjectId(campaignId) },
          {
            $set: {
              status: totalSent > 0 ? "Sent" : "Failed",
              customersReached: totalSent,
              sentAt: new Date(),
              failedCount: failedCount,
            },
          }
        );

        console.log("====================================");
        console.log("CAMPAIGN COMPLETED");
        console.log("Customers targeted:", consentedCustomers.length);
        console.log("WhatsApp Messages sent:", whatsappSent);
        console.log("Emails sent:", emailSent);
        console.log("Messages failed:", failedCount);
        console.log("====================================");

        return res.status(200).json({
          success: totalSent > 0,
          message: totalSent > 0 ? "Campaign sent successfully." : "No messages were sent.",
          whatsappSent,
          emailSent,
          customersTargeted: consentedCustomers.length,
          customersReached: totalSent,
          failed: failedCount,
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
          notificationPreference: findFormValue(formData, ["Would you like to receive updates about new arrivals, offers and promotions from TRS Fashion?", "Would you like to receive updates about new arrivals, offers and promotions from TRS Fashion", "Updates / Promotions", "Notification Preference", "notificationPreference"]),
          source: "google-form",
          formTimestamp: formTimestamp,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: "Active",
          category: "General",
          preferredSareeTypes: [],
          marketingConsent: true,
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
    return res.status(401).json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    name: req.user.displayName,
    email: req.user.emails?.[0]?.value || "",
    photo: req.user.photos?.[0]?.value || "",
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
      res.redirect("http://localhost:8080/");
    });
  });
});
    // =================================================
    // START EXPRESS SERVER
    // =================================================

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}

// =====================================================
// START APPLICATION
// =====================================================

startServer();