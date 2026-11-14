import { DEFAULT_GEMINI_MODEL } from '../src/ai/geminiReconstruction.ts';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'online',
    ai_vision_engine: Boolean(process.env.GEMINI_API_KEY?.trim()),
    model: DEFAULT_GEMINI_MODEL,
  });
}
