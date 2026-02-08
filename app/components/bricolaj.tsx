/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  RefreshCw,
  ShoppingCart,
  List,
  Info,
  Wrench,
  X,
  ChevronRight,
  Tag,
  AlertCircle,
  ExternalLink,
  MessageCircle,
  Send,
  Bot,
  Image as ImageIcon,
  Sun,
  Moon,
  Hammer,
  Zap,
  Square,
  ShieldCheck,
  SearchX,
  MessageSquare,
  Scale,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react";
import { analizeImage } from "../api/analyze-image";
import { analyzeComparisonApi } from "../api/analyze-comparison";
import { chatApi } from "../api/chat";
import Image from "next/image";

// --- Tipuri de Date ---

interface ProductRecommendation {
  nume: string;
  categorie: string;
}

interface ScanResult {
  valid_product: boolean;
  brand?: string | null;
  nume_produs: string;
  descriere: string;
  specificatii: string[];
  produse_recomandate: ProductRecommendation[];
  utilizare: string;
  motiv_invalid?: string;
}

interface CompareResult {
  produs1_nume: string;
  produs2_nume: string;
  diferente: string[];
  produs1_avantaj: string;
  produs2_avantaj: string;
  concluzie: string;
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

// --- Componente UI ---

const DedemanLogo = () => (
  // <svg
  //   width="40"
  //   height="40"
  //   viewBox="0 0 40 40"
  //   fill="none"
  //   xmlns="http://www.w3.org/2000/svg"
  //   className="shrink-0 shadow-sm rounded-full"
  // >
  //   <circle cx="20" cy="20" r="20" fill="white" />
  //   <path
  //     d="M10 32C10 27 14 26 20 26C26 26 30 27 30 32V36H10V32Z"
  //     fill="#1E40AF"
  //   />
  //   <rect x="12" y="14" width="16" height="14" rx="4" fill="#1E40AF" />
  //   <path d="M10 14C10 9 14 6 20 6C26 6 30 9 30 14H10Z" fill="#F97316" />
  //   <rect
  //     x="16"
  //     y="5"
  //     width="8"
  //     height="2"
  //     rx="1"
  //     fill="#FFEDD5"
  //     fillOpacity="0.8"
  //   />
  //   <line x1="20" y1="6" x2="20" y2="3" stroke="#94A3B8" strokeWidth="2" />
  //   <circle cx="20" cy="3" r="1.5" fill="#EF4444" />
  //   <circle cx="16" cy="20" r="2" fill="white" />
  //   <circle cx="24" cy="20" r="2" fill="white" />
  //   <circle cx="16" cy="20" r="1" fill="#3B82F6" />
  //   <circle cx="24" cy="20" r="1" fill="#3B82F6" />
  //   <rect x="18" y="24" width="4" height="1.5" rx="0.5" fill="#93C5FD" />
  // </svg>
  <Image
    src={"/homeLogoWhiteBg.png"}
    alt=""
    width={38}
    height={38}
    className=""
  />
);

export default function DedemanScanner() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inițializare temă (Safe for SSR)
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dedehelp_theme");
      if (saved === "dark") setIsDarkMode(true);
    }
  }, []);

  // Modale
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [modalVisibleCount, setModalVisibleCount] = useState(5);

  // Stare Comparare
  const [compareImg1, setCompareImg1] = useState<string | null>(null);
  const [compareImg2, setCompareImg2] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(
    null
  );
  const [compareLoading, setCompareLoading] = useState(false);

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Refs Scanare Single
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Refs Comparare
  const compCam1Ref = useRef<HTMLInputElement>(null);
  const compGal1Ref = useRef<HTMLInputElement>(null);
  const compCam2Ref = useRef<HTMLInputElement>(null);
  const compGal2Ref = useRef<HTMLInputElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom la chat
  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isChatOpen]);

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem("dedehelp_theme", newTheme ? "dark" : "light");
  };

  // --- Helpers ---

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    try {
      const file = event.target.files?.[0];
      if (file) {
        const base64 = await convertFileToBase64(file);
        setImage(base64);
        analyzeImage(base64);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      setError("Nu s-a putut încărca imaginea.");
    }
  };

  const handleCompareUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    slot: 1 | 2
  ) => {
    try {
      const file = event.target.files?.[0];
      if (file) {
        const base64 = await convertFileToBase64(file);
        if (slot === 1) setCompareImg1(base64);
        if (slot === 2) setCompareImg2(base64);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const stopScanning = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setLoading(false);
    setProgress(0);
    setError("Scanare oprită de utilizator.");
  };

  const startProgressSimulation = () => {
    setProgress(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        let increment = 0;
        if (prev < 30) increment = 5;
        else if (prev < 60) increment = 2;
        else if (prev < 85) increment = 0.5;
        else if (prev < 95) increment = 0.1;
        const next = prev + increment;
        return next > 95 ? 95 : next;
      });
    }, 200);
  };

  // --- API CALLS ---

  const analyzeImage = async (base64Image: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    startProgressSimulation();
    setError(null);
    setResult(null);
    setIsModalOpen(false);
    setIsChatOpen(false);
    setChatHistory([]);

    try {
      const data = await analizeImage(base64Image, controller);
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error("Date invalide.");

      const parsedResult = JSON.parse(
        textResponse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim()
      );

      setProgress(100);
      setTimeout(() => {
        setResult(parsedResult);
        setLoading(false);
        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);
      }, 300);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error(err);
      setError("Verifică conexiunea la internet.");
      setLoading(false);
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
    }
  };

  const analyzeComparison = async () => {
    if (!compareImg1 || !compareImg2) return;
    setCompareLoading(true);
    setCompareResult(null);

    try {
      const data1 = compareImg1.split(",")[1];
      const mime1 = compareImg1.split(";")[0].split(":")[1];
      const data2 = compareImg2.split(",")[1];
      const mime2 = compareImg2.split(";")[0].split(":")[1];

      const data = await analyzeComparisonApi(mime1, data1, mime2, data2);
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setCompareResult(
        JSON.parse(
          textResponse
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()
        )
      );
    } catch (e) {
      console.error(e);
    } finally {
      setCompareLoading(false);
    }
  };

  const openGeneralChat = () => {
    setChatHistory([]);
    setIsChatOpen(true);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMessage = chatInput;
    setChatInput("");
    setChatHistory((prev) => [...prev, { role: "user", text: userMessage }]);
    setChatLoading(true);

    try {
      let prompt = "";
      let payload = {};

      if (image && result) {
        const base64Data = image.split(",")[1];
        const mimeType = image.split(";")[0].split(":")[1];
        prompt = `Produs analizat: ${result.nume_produs}. Întrebare utilizator: "${userMessage}". Răspunde scurt, tehnic, ca un expert Dedeman.`;
        payload = {
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            },
          ],
        };
      } else {
        prompt = `Ești un asistent virtual expert pentru magazinul Dedeman România. Răspunde la întrebarea utilizatorului despre bricolaj, construcții sau produse.
        Întrebare: "${userMessage}". Răspunde politicos, scurt și oferă sfaturi tehnice dacă este cazul.`;
        payload = { contents: [{ parts: [{ text: prompt }] }] };
      }

      const data = await chatApi(payload);
      const reply =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "Eroare.";
      setChatHistory((prev) => [...prev, { role: "model", text: reply }]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        { role: "model", text: "Eroare conexiune." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const resetScanner = () => {
    setImage(null);
    setResult(null);
    setError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  // Nu randa nimic până nu suntem pe client (previne hydration mismatch pt dark mode)
  if (!mounted) return null;

  const ProductItem = ({
    item,
    minimal,
  }: {
    item: ProductRecommendation;
    minimal?: boolean;
  }) => {
    const searchUrl = `https://www.dedeman.ro/ro/cautare?q=${encodeURIComponent(
      item.nume
    )}`;
    return (
      <div
        className={`flex gap-3 items-start p-3 rounded-lg border shadow-sm transition-colors ${
          !minimal ? "mb-2" : ""
        } ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div
          className={`w-10 h-10 rounded border flex items-center justify-center shrink-0 ${
            isDarkMode
              ? "bg-gray-700 border-gray-600"
              : "bg-gray-50 border-gray-100"
          }`}
        >
          <Tag size={16} className="text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-[10px] font-bold uppercase tracking-wide ${
              isDarkMode ? "text-blue-400" : "text-blue-600"
            }`}
          >
            {item.categorie}
          </p>
          <p
            className={`text-sm font-bold leading-tight mt-0.5 mb-2 ${
              isDarkMode ? "text-gray-100" : "text-gray-800"
            }`}
          >
            {item.nume}
          </p>
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline px-2 py-1 rounded ${
              isDarkMode
                ? "bg-orange-900/30 text-orange-400"
                : "bg-orange-50 text-orange-600"
            }`}
          >
            Vezi pe Dedeman.ro <ExternalLink size={10} />
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <style>{`
        @keyframes scanDown {
          0% { top: 0%; opacity: 0.8; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0.8; }
        }
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 4px;
          background: #f97316;
          box-shadow: 0 0 15px #f97316;
          animation: scanDown 2s linear infinite;
          z-index: 10;
        }
        .grid-overlay {
          background-image: linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 30px 30px;
        }
        .fade-in { animation: fadeIn 0.5s ease-in; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .dark ::-webkit-scrollbar { width: 8px; }
        .dark ::-webkit-scrollbar-track { background: #1f2937; }
        .dark ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }

        .progress-bar-striped {
          background-image: linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent);
          background-size: 1rem 1rem;
        }
      `}</style>

      <div
        className={`min-h-screen font-sans pb-2 transition-colors duration-300 ${
          isDarkMode ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800"
        }`}
      >
        {/* HEADER */}
        <header
          className={`w-md p-3 sticky top-0 z-20 shadow-md transition-colors ${
            isDarkMode ? "bg-orange-700" : "bg-orange-600"
          }`}
        >
          <div className="max-w-md mx-auto flex justify-between items-center">
            <a
              href="https://www.dedeman.ro"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 no-underline text-white hover:opacity-90 transition-opacity"
            >
              <DedemanLogo />
              <h1 className="text-xl font-bold tracking-tight text-white">
                DedeHelp AI
              </h1>
            </a>

            <div className="flex gap-2 items-center">
              <button
                onClick={toggleTheme}
                className="bg-orange-700/80 p-2 rounded-full hover:bg-orange-700 transition active:scale-95 text-white mr-1"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              {image && !loading && (
                <>
                  <button
                    onClick={resetScanner}
                    className="bg-orange-700/80 p-2 rounded-full hover:bg-orange-700 transition active:scale-95 text-white"
                  >
                    <Camera size={20} />
                  </button>
                  <button
                    onClick={() => image && analyzeImage(image)}
                    className="bg-orange-700/80 p-2 rounded-full hover:bg-orange-700 transition active:scale-95 text-white"
                  >
                    <RefreshCw size={20} />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-md mx-auto p-4 min-h-[85vh]">
          {/* ECRAN INITIAL */}
          {!image && (
            <div
              className={`p-8 rounded-2xl shadow-lg border text-center fade-in transition-colors ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-100"
              }`}
            >
              <div
                className={`inline-block p-6 rounded-full mb-6 ${
                  isDarkMode ? "bg-blue-900/30" : "bg-blue-50"
                }`}
              >
                {/* <Camera
                  size={48}
                  className={isDarkMode ? "text-blue-400" : "text-blue-600"}
                /> */}
                <Image
                  src={"/homeLogo.png"}
                  alt=""
                  width={180}
                  height={180}
                  className=""
                />
              </div>
              <h2
                className={`text-2xl font-bold mb-3 ${
                  isDarkMode ? "text-white" : "text-gray-800"
                }`}
              >
                Scanare Produs
              </h2>
              <p
                className={`mb-8 leading-relaxed ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Alege cum vrei să încarci imaginea produsului de la raft pentru
                a fi scanat.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-3 text-lg hover:bg-orange-700 transition active:scale-95"
                >
                  <Camera size={24} /> Fă o Poză
                </button>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className={`w-full border-2 font-bold py-4 rounded-xl flex items-center justify-center gap-3 text-lg transition active:scale-95 ${
                    isDarkMode
                      ? "bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <ImageIcon size={24} /> Din Galerie
                </button>

                <button
                  onClick={openGeneralChat}
                  className={`w-full font-bold py-4 rounded-xl shadow-md flex items-center justify-center gap-3 text-lg transition active:scale-95 mt-2 border ${
                    isDarkMode
                      ? "bg-gray-600 text-white hover:bg-gray-500 border-gray-500"
                      : "bg-gray-900 text-white hover:bg-gray-800 border-gray-700"
                  }`}
                >
                  <MessageSquare size={24} className="text-orange-400" />{" "}
                  Întreabă AI-ul (Direct)
                </button>

                <button
                  onClick={() => setIsCompareModalOpen(true)}
                  className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl shadow-md flex items-center justify-center gap-3 text-lg hover:bg-purple-700 transition active:scale-95 mt-2"
                >
                  <Scale size={24} /> Compară 2 Produse
                </button>
              </div>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={cameraInputRef}
                onChange={handleImageUpload}
                className="hidden"
              />
              <input
                type="file"
                accept="image/*"
                ref={galleryInputRef}
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          )}

          {/* RADAR LOADING SCREEN */}
          {loading && image && (
            <div className="flex justify-center items-center p-6 mt-6 gap-2 relative w-full h-96 bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-orange-500 fade-in flex-col">
              <div className="absolute inset-0 z-0">
                <img
                  src={image || ""}
                  alt="Scanning"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 grid-overlay opacity-30"></div>
                <div className="scan-line"></div>
              </div>

              <div className="z-10 relative flex flex-col justify-between h-full w-full ">
                <div className="flex justify-between items-start ">
                  <div className="text-orange-400 font-mono text-xs flex items-center gap-2 bg-black/60 backdrop-blur-md p-1.5 px-3 rounded-lg border border-orange-500/30">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    SCANNING...
                  </div>
                  <button
                    onClick={stopScanning}
                    className="bg-red-600/90 hover:bg-red-700 text-white text-xs font-bold py-1.5 px-3 rounded-full flex items-center gap-1.5 transition shadow-lg backdrop-blur-sm"
                  >
                    <Square size={10} fill="white" /> Oprește
                  </button>
                </div>
                <div className="w-full">
                  <div className="flex justify-between text-white text-xs font-bold mb-2 uppercase tracking-widest shadow-black drop-shadow-md">
                    <span>Analiză AI</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3 border border-gray-600 overflow-hidden">
                    <div
                      className="bg-orange-500 h-3 rounded-full transition-all duration-300 ease-out progress-bar-striped"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EROARE */}
          {error && (
            <div
              className={`p-4 rounded-lg mt-6 flex items-center gap-3 border fade-in ${
                isDarkMode
                  ? "bg-red-900/20 text-red-300 border-red-800"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              <AlertCircle size={24} />
              <p className="text-sm font-medium">{error}</p>
              <button
                onClick={resetScanner}
                className="ml-auto text-xs underline font-bold"
              >
                Resetează
              </button>
            </div>
          )}

          {/* ECRAN PRODUS NEIDENTIFICAT */}
          {result && !loading && result.valid_product === false && (
            <div
              className={`p-6 rounded-2xl shadow-lg mt-6 text-center border fade-in ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div
                className={`inline-block p-4 rounded-full mb-4 ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                <SearchX
                  size={40}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
              <h3
                className={`text-xl font-bold mb-2 ${
                  isDarkMode ? "text-white" : "text-gray-800"
                }`}
              >
                Produs Neidentificat
              </h3>
              <p
                className={`text-sm mb-6 ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {result.motiv_invalid ||
                  "Imaginea nu pare să conțină un produs clar."}
              </p>
              <button
                onClick={resetScanner}
                className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 transition"
              >
                Încearcă din nou
              </button>
            </div>
          )}

          {/* REZULTATE VALIDE */}
          {result && !loading && result.valid_product !== false && (
            <div className="space-y-4 mt-2 fade-in">
              <div
                className={`relative h-48 rounded-2xl overflow-hidden shadow-md group border-b-4 border-orange-500 ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-200"
                }`}
              >
                <img
                  src={image || ""}
                  alt="Produs"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-3 pt-10">
                  <h2 className="text-white font-bold text-lg leading-tight">
                    <a
                      href={`https://www.dedeman.ro/ro/cautare?q=${encodeURIComponent(
                        result.nume_produs
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-2 decoration-orange-400 underline-offset-4"
                    >
                      {result.nume_produs}
                      <ExternalLink
                        size={16}
                        className="text-orange-400 opacity-80"
                      />
                    </a>
                  </h2>
                </div>
              </div>

              <div
                className={`p-5 rounded-xl shadow-sm border transition-colors ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-100"
                }`}
              >
                {result.brand && result.brand !== "null" && (
                  <div className="mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border shadow-sm ${
                        isDarkMode
                          ? "bg-gray-700 text-gray-200 border-gray-600"
                          : "bg-gray-100 text-gray-800 border-gray-200"
                      }`}
                    >
                      <ShieldCheck
                        size={14}
                        className={
                          isDarkMode ? "text-blue-400" : "text-blue-600"
                        }
                      />
                      Brand: {result.brand}
                    </span>
                  </div>
                )}
                <div
                  className={`flex items-center gap-2 mb-2 text-xs font-bold uppercase ${
                    isDarkMode ? "text-blue-400" : "text-blue-600"
                  }`}
                >
                  <Info size={16} /> Descriere
                </div>
                <p
                  className={`text-sm leading-relaxed text-justify ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {result.descriere}
                </p>
              </div>

              <button
                onClick={() => setIsChatOpen(true)}
                className={`w-full p-4 rounded-xl shadow-lg flex items-center justify-between transition active:scale-95 border ${
                  isDarkMode
                    ? "bg-gray-700 text-white border-gray-600"
                    : "bg-gray-900 text-white border-gray-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      isDarkMode ? "bg-gray-600" : "bg-gray-700"
                    }`}
                  >
                    <MessageCircle size={20} className="text-orange-400" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Asistent AI</p>
                    <p
                      className={`text-[10px] ${
                        isDarkMode ? "text-gray-300" : "text-gray-400"
                      }`}
                    >
                      Întreabă despre produs
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-500"}
                />
              </button>

              <div
                className={`p-5 rounded-xl shadow-sm border transition-colors ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-100"
                }`}
              >
                <div
                  className={`flex items-center gap-2 mb-3 text-xs font-bold uppercase ${
                    isDarkMode ? "text-orange-400" : "text-orange-600"
                  }`}
                >
                  <List size={16} /> Specificații
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.specificatii?.map((s, i) => (
                    <span
                      key={i}
                      className={`text-xs font-medium px-2 py-1 rounded border ${
                        isDarkMode
                          ? "text-gray-300 bg-gray-700 border-gray-600"
                          : "text-gray-700 bg-gray-100 border-gray-200"
                      }`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className={`p-5 rounded-xl border transition-colors ${
                  isDarkMode
                    ? "bg-blue-900/20 border-blue-800"
                    : "bg-blue-50 border-blue-100"
                }`}
              >
                <div
                  className={`flex items-center gap-2 mb-4 font-bold uppercase text-xs ${
                    isDarkMode ? "text-blue-300" : "text-blue-800"
                  }`}
                >
                  <ShoppingCart size={16} /> Necesar & Compatibil
                </div>
                <div className="grid gap-3 mb-4">
                  {result.produse_recomandate?.slice(0, 3).map((item, idx) => (
                    <ProductItem key={idx} item={item} minimal={true} />
                  ))}
                </div>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className={`w-full font-bold py-3 rounded-xl flex justify-center items-center gap-2 text-sm shadow-md transition-colors ${
                    isDarkMode
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-none"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                  }`}
                >
                  Vezi toate recomandările <ChevronRight size={16} />
                </button>
              </div>

              <div
                className={`p-5 rounded-xl flex gap-4 items-start shadow-md transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-white"
                }`}
              >
                <Wrench className="text-orange-500 shrink-0 mt-1" size={20} />
                <div>
                  <p className="text-xs font-bold text-orange-500 uppercase mb-1">
                    Sfat Utilizare
                  </p>
                  <p className="text-sm italic text-gray-300">
                    {result.utilizare}
                  </p>
                </div>
              </div>

              <div className="pt-4 pb-4">
                <button
                  onClick={resetScanner}
                  className={`w-full border-2 font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 shadow-sm ${
                    isDarkMode
                      ? "bg-gray-800 border-orange-500 text-orange-500 hover:bg-gray-700"
                      : "bg-white border-orange-600 text-orange-600 hover:bg-orange-50"
                  }`}
                >
                  <Camera size={20} /> Scanează alt produs
                </button>
              </div>
            </div>
          )}
        </main>

        <footer
          className={`text-center p-4 text-xs pb-8 transition-colors flex items-center justify-center gap-2 ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
        >
          Powered by Scule Electrice
          <div
            className={`flex gap-1 p-1 rounded ${
              isDarkMode ? "bg-gray-800" : "bg-gray-100"
            }`}
          >
            <Zap size={14} className="text-yellow-500" />
            <Hammer
              size={14}
              className={isDarkMode ? "text-gray-400" : "text-gray-600"}
            />
          </div>
          Razvan
        </footer>

        {/* MODALA COMPARARE */}
        {isCompareModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={() => setIsCompareModalOpen(false)}
          >
            <div
              className={`w-full max-w-md max-h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl transition-colors ${
                isDarkMode ? "bg-gray-800" : "bg-white"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`p-4 border-b flex justify-between items-center bg-purple-600 text-white ${
                  isDarkMode ? "border-gray-700" : ""
                }`}
              >
                <h3 className="font-bold flex items-center gap-2">
                  <Scale size={18} /> Compară Produse
                </h3>
                <button
                  onClick={() => setIsCompareModalOpen(false)}
                  className="p-2 bg-purple-700 rounded-full hover:bg-purple-800 transition"
                >
                  <X size={20} />
                </button>
              </div>

              <div
                className={`flex-1 overflow-y-auto p-4 ${
                  isDarkMode ? "bg-gray-900" : "bg-gray-50"
                }`}
              >
                {/* SLOTURI IMAGINI */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {/* Slot 1 */}
                  <div className="flex flex-col gap-2">
                    <div
                      className={`aspect-square rounded-xl overflow-hidden flex items-center justify-center border-2 border-dashed relative ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600"
                          : "bg-gray-200 border-gray-400"
                      }`}
                    >
                      {compareImg1 ? (
                        <img
                          src={compareImg1}
                          className="w-full h-full object-cover"
                          alt="Prod 1"
                        />
                      ) : (
                        <div className="text-center p-2">
                          <p className="text-xs font-bold text-gray-500">
                            Produs 1
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => compCam1Ref.current?.click()}
                        className="flex-1 bg-blue-600 text-white p-2 rounded-lg text-xs font-bold hover:bg-blue-700"
                      >
                        <Camera size={14} className="mx-auto" />
                      </button>
                      <button
                        onClick={() => compGal1Ref.current?.click()}
                        className={`flex-1 p-2 rounded-lg text-xs font-bold hover:bg-opacity-80 ${
                          isDarkMode
                            ? "bg-gray-700 text-gray-200"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        <ImageIcon size={14} className="mx-auto" />
                      </button>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      ref={compCam1Ref}
                      onChange={(e) => handleCompareUpload(e, 1)}
                      className="hidden"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      ref={compGal1Ref}
                      onChange={(e) => handleCompareUpload(e, 1)}
                      className="hidden"
                    />
                  </div>

                  {/* Slot 2 */}
                  <div className="flex flex-col gap-2">
                    <div
                      className={`aspect-square rounded-xl overflow-hidden flex items-center justify-center border-2 border-dashed relative ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600"
                          : "bg-gray-200 border-gray-400"
                      }`}
                    >
                      {compareImg2 ? (
                        <img
                          src={compareImg2}
                          className="w-full h-full object-cover"
                          alt="Prod 2"
                        />
                      ) : (
                        <div className="text-center p-2">
                          <p className="text-xs font-bold text-gray-500">
                            Produs 2
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => compCam2Ref.current?.click()}
                        className="flex-1 bg-blue-600 text-white p-2 rounded-lg text-xs font-bold hover:bg-blue-700"
                      >
                        <Camera size={14} className="mx-auto" />
                      </button>
                      <button
                        onClick={() => compGal2Ref.current?.click()}
                        className={`flex-1 p-2 rounded-lg text-xs font-bold hover:bg-opacity-80 ${
                          isDarkMode
                            ? "bg-gray-700 text-gray-200"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        <ImageIcon size={14} className="mx-auto" />
                      </button>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      ref={compCam2Ref}
                      onChange={(e) => handleCompareUpload(e, 2)}
                      className="hidden"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      ref={compGal2Ref}
                      onChange={(e) => handleCompareUpload(e, 2)}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Buton Analiza */}
                <button
                  onClick={analyzeComparison}
                  disabled={!compareImg1 || !compareImg2 || compareLoading}
                  className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition mb-6 flex items-center justify-center gap-2"
                >
                  {compareLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <ArrowRightLeft size={18} /> Analizează Diferențele
                    </>
                  )}
                </button>

                {/* Rezultat Comparare */}
                {compareResult && !compareLoading && (
                  <div className="space-y-4 animate-slide-up">
                    <div
                      className={`p-4 rounded-xl border ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <div
                        className={`flex justify-between items-center text-xs font-bold mb-2 uppercase tracking-wide ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        <span>Produs A</span>
                        <span>vs</span>
                        <span>Produs B</span>
                      </div>
                      <div
                        className={`flex justify-between items-center text-sm font-bold mb-4 ${
                          isDarkMode ? "text-white" : "text-gray-800"
                        }`}
                      >
                        <span className="w-1/2 pr-2">
                          {compareResult.produs1_nume}
                        </span>
                        <div
                          className={`h-8 w-px ${
                            isDarkMode ? "bg-gray-600" : "bg-gray-300"
                          }`}
                        ></div>
                        <span className="w-1/2 pl-2 text-right">
                          {compareResult.produs2_nume}
                        </span>
                      </div>

                      {/* Diferente */}
                      <div className="mb-4">
                        <h4 className="text-xs font-bold text-purple-600 uppercase mb-2">
                          Diferențe Cheie
                        </h4>
                        <ul className="space-y-2">
                          {compareResult.diferente?.map((d, i) => (
                            <li
                              key={i}
                              className={`text-xs p-2 rounded border ${
                                isDarkMode
                                  ? "bg-purple-900/20 text-purple-200 border-purple-800"
                                  : "bg-purple-50 text-purple-900 border-purple-100"
                              }`}
                            >
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Avantaje */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div
                          className={`p-2 rounded border ${
                            isDarkMode
                              ? "bg-green-900/20 border-green-800"
                              : "bg-green-50 border-green-100"
                          }`}
                        >
                          <p
                            className={`text-[10px] font-bold mb-1 ${
                              isDarkMode ? "text-green-400" : "text-green-700"
                            }`}
                          >
                            Avantaj A
                          </p>
                          <p
                            className={`text-xs ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }`}
                          >
                            {compareResult.produs1_avantaj}
                          </p>
                        </div>
                        <div
                          className={`p-2 rounded border ${
                            isDarkMode
                              ? "bg-green-900/20 border-green-800"
                              : "bg-green-50 border-green-100"
                          }`}
                        >
                          <p
                            className={`text-[10px] font-bold mb-1 text-right ${
                              isDarkMode ? "text-green-400" : "text-green-700"
                            }`}
                          >
                            Avantaj B
                          </p>
                          <p
                            className={`text-xs text-right ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }`}
                          >
                            {compareResult.produs2_avantaj}
                          </p>
                        </div>
                      </div>

                      {/* Concluzie */}
                      <div
                        className={`p-3 rounded-lg flex gap-2 ${
                          isDarkMode ? "bg-gray-700" : "bg-gray-100"
                        }`}
                      >
                        <CheckCircle2
                          size={20}
                          className={
                            isDarkMode ? "text-green-400" : "text-green-600"
                          }
                          shrink-0
                        />
                        <div>
                          <p
                            className={`text-xs font-bold mb-1 ${
                              isDarkMode ? "text-white" : "text-gray-800"
                            }`}
                          >
                            Concluzie Expert
                          </p>
                          <p
                            className={`text-xs ${
                              isDarkMode ? "text-gray-300" : "text-gray-600"
                            }`}
                          >
                            {compareResult.concluzie}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODALA LISTA (Compatibilitate) */}
        {isModalOpen && result && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className={`w-full max-w-md max-h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl transition-colors ${
                isDarkMode ? "bg-gray-800" : "bg-white"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`p-4 border-b flex justify-between items-center ${
                  isDarkMode ? "bg-gray-900 border-gray-700" : "bg-gray-50"
                }`}
              >
                <h3
                  className={`font-bold ${
                    isDarkMode ? "text-white" : "text-gray-800"
                  }`}
                >
                  Recomandări Complete
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className={`p-2 rounded-full transition ${
                    isDarkMode
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <X size={20} />
                </button>
              </div>
              <div
                className={`flex-1 overflow-y-auto p-4 space-y-3 ${
                  isDarkMode ? "bg-gray-900" : "bg-gray-50"
                }`}
              >
                {result.produse_recomandate
                  ?.slice(0, modalVisibleCount + 5)
                  .map((item, idx) => (
                    <ProductItem key={idx} item={item} />
                  ))}
                {modalVisibleCount + 5 <
                  (result.produse_recomandate?.length || 0) && (
                  <button
                    onClick={() => setModalVisibleCount((c) => c + 5)}
                    className={`w-full py-3 mt-4 border-2 border-dashed font-bold rounded-xl transition ${
                      isDarkMode
                        ? "bg-gray-800 border-blue-700 text-blue-400 hover:bg-gray-700"
                        : "bg-white border-blue-300 text-blue-600 hover:bg-blue-50"
                    }`}
                  >
                    Încarcă mai multe
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODALA CHAT */}
        {isChatOpen && (
          <div
            className={`fixed inset-0 z-50 sm:max-w-md sm:mx-auto flex flex-col transition-colors ${
              isDarkMode ? "bg-gray-900" : "bg-white"
            }`}
          >
            <div
              className={`p-4 flex items-center justify-between shadow-md ${
                isDarkMode ? "bg-gray-800 text-white" : "bg-gray-900 text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 p-2 rounded-full">
                  <Bot size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Asistent DedeHelp</h3>
                  <p className="text-[10px] text-gray-400">Live Chat</p>
                </div>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className={`p-2 rounded-full transition ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600"
                    : "bg-gray-800 hover:bg-gray-700"
                }`}
              >
                <X size={20} />
              </button>
            </div>
            <div
              className={`flex-1 overflow-y-auto p-4 space-y-4 ${
                isDarkMode ? "bg-gray-900" : "bg-gray-100"
              }`}
            >
              {chatHistory.length === 0 && (
                <div className="text-center mt-10 p-6">
                  <MessageCircle
                    size={48}
                    className="mx-auto mb-4 opacity-20 text-gray-400"
                  />
                  <p
                    className={`text-sm font-medium mb-2 ${
                      isDarkMode ? "text-gray-300" : "text-gray-500"
                    }`}
                  >
                    {image
                      ? "Întreabă despre produsul scanat"
                      : "Întreabă orice despre Dedeman"}
                  </p>
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      msg.role === "user"
                        ? "bg-orange-600 text-white rounded-br-none"
                        : isDarkMode
                        ? "bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-none"
                        : "bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="text-xs text-gray-400 italic ml-2">
                  Asistentul scrie...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form
              onSubmit={handleSendMessage}
              className={`p-3 border-t flex gap-2 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Scrie aici..."
                className={`flex-1 rounded-full px-4 py-3 text-sm outline-none border transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 text-white border-gray-600 focus:border-orange-500"
                    : "bg-gray-100 text-gray-800 border-gray-200 focus:border-orange-500"
                }`}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                className="bg-orange-600 text-white p-3 rounded-full hover:bg-orange-700"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export function Bricolaj() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <DedemanScanner />
    </div>
  );
}
