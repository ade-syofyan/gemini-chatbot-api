import { GoogleGenAI } from "@google/genai";
import cors from "cors";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY belum diatur.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.post("/api/chat", async (req, res) => {
  const { message, history, stream } = req.body;

  if (!message || typeof message !== "string") {
    return res
      .status(400)
      .json({ reply: "Message is required and must be a string." });
  }

  try {
    // Format history
    const chatContent = [
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
      ...(Array.isArray(history)
        ? history.map((item) => ({
            role: item.sender === "user" ? "user" : "model",
            parts: [{ text: item.text }],
          }))
        : []),
      {
        role: "user",
        parts: [{ text: message }],
      },
    ];

    const response = await genAI.models.generateContent({
      model: "gemini-1.5-flash",
      contents: chatContent,
    });

    const reply = response.text;

    if (!reply) {
      return res.status(500).json({ reply: "No response from AI." });
    }

    // Hanya simulasi stream, karena genai tidak support streaming
    if (stream !== false) {
      // Simulasi delay seolah-olah streaming
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      for (const char of reply) {
        res.write(char);
        await new Promise((r) => setTimeout(r, 5)); // delay 5ms per karakter
      }

      res.end();
    } else {
      // Non-streaming
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

app.listen(port, () => {
  console.log(`✅ Server aktif di http://localhost:${port}`);
});
