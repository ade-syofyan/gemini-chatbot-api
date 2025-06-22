import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY belum diatur.");
  process.exit(1);
}

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// MIME types yang diizinkan
const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "application/pdf",
  "text/plain",
];

// Konfigurasi multer dengan filter
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 }, // max 20MB per file, max 10 files
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Jenis file tidak didukung: ${file.originalname} (${file.mimetype})`
        )
      );
    }
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

app.post("/api/chat", upload.array("files", 10), async (req, res) => {
  const { message } = req.body;

  if (!message && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ reply: "Message or file is required." });
  }

  try {
    let history = [];

    if (Array.isArray(req.body.history)) {
      history = req.body.history;
    } else if (typeof req.body.history === "string") {
      try {
        history = JSON.parse(req.body.history);
      } catch (e) {
        console.error("❌ Failed to parse history:", e);
        return res.status(400).json({ reply: "Invalid history format." });
      }
    }

    const stream = req.body.stream === "true";

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: "Gunakan Bahasa Indonesia sebagai default. Namun, jika saya menulis dalam bahasa lain atau memberikan instruksi dalam bahasa lain, tolong balas sesuai dengan bahasa dan instruksi tersebut.",
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "Baik, saya mengerti. Saya akan membalas dalam Bahasa Indonesia kecuali diminta sebaliknya.",
          },
        ],
      },
    ];

    // Tambahkan riwayat jika ada
    contents.push(
      ...history.map((item) => ({
        role: item.sender === "user" ? "user" : "model",
        parts: [{ text: item.text }],
      }))
    );

    const currentParts = [];

    if (message) {
      currentParts.push({ text: message });
    }

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        currentParts.push({
          inlineData: {
            mimeType: file.mimetype,
            data: file.buffer.toString("base64"),
          },
        });
      }
    }

    contents.push({
      role: "user",
      parts: currentParts,
    });

    const result = await genAI.models.generateContent({
      model: "gemini-1.5-flash",
      contents,
      safetySettings,
    });

    const reply = result.text;

    if (!reply) {
      return res.status(500).json({ reply: "No response from AI." });
    }

    if (stream) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      for (const char of reply) {
        res.write(char);
        await new Promise((r) => setTimeout(r, 5));
      }

      res.end();
    } else {
      res.json({ reply });
    }
  } catch (error) {
    console.error("AI error:", error);
    if (!res.headersSent) {
      res.status(500).json({ reply: "Terjadi kesalahan pada server." });
    } else {
      res.end();
    }
  }
});

// Middleware untuk menangani error dari multer (seperti file tidak valid)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ reply: `Multer error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ reply: err.message });
  }
  next();
});

app.listen(port, () => {
  console.log(`✅ Server aktif di http://localhost:${port}`);
});
