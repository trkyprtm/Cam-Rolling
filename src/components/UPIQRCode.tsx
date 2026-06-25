import React, { useMemo } from "react";
import { motion } from "motion/react";

interface UPIQRCodeProps {
  amount: number;
  roomId: string;
}

export function UPIQRCode({ amount, roomId }: UPIQRCodeProps) {
  // Generate a mock 21x21 QR grid with finder patterns at the corners
  const grid = useMemo(() => {
    const size = 21;
    const matrix: boolean[][] = Array(size)
      .fill(null)
      .map(() => Array(size).fill(false));

    // Helper to draw a finder pattern at (r, c)
    const drawFinderPattern = (row: number, col: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isOuterBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInnerCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (isOuterBorder || isInnerCenter) {
            matrix[row + r][col + c] = true;
          }
        }
      }
    };

    // Draw finders at Top-Left, Top-Right, Bottom-Left
    drawFinderPattern(0, 0);
    drawFinderPattern(0, size - 7);
    drawFinderPattern(size - 7, 0);

    // Draw random high density QR bits for the rest of the cells
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Skip finder areas
        const inTopLeftFinder = r < 8 && c < 8;
        const inTopRightFinder = r < 8 && c >= size - 8;
        const inBottomLeftFinder = r >= size - 8 && c < 8;
        
        if (!inTopLeftFinder && !inTopRightFinder && !inBottomLeftFinder) {
          // Semi-random noise but deterministic based on amount and room code to look structured
          const seed = r * 13 + c * 37 + Math.floor(amount * 10) + roomId.charCodeAt(0 || 0);
          matrix[r][c] = (seed % 3 === 0 || seed % 7 === 0);
        }
      }
    }

    return matrix;
  }, [amount, roomId]);

  return (
    <div id="upi-qr-wrapper" className="flex flex-col items-center gap-3 bg-neutral-950 border border-white/5 p-4 rounded-2xl relative overflow-hidden group select-none">
      {/* Interactive dynamic glow */}
      <div className="absolute inset-0 bg-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>
      
      {/* Title */}
      <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 font-mono font-bold tracking-widest uppercase mb-1">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
        Scan to Pay via UPI
      </div>

      {/* QR Core Container */}
      <div className="relative p-3 bg-white rounded-xl shadow-lg border border-neutral-800 flex items-center justify-center">
        {/* Animated Scanning Laser Line */}
        <motion.div
          animate={{ top: ["12px", "152px", "12px"] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="absolute left-3 right-3 h-0.5 bg-emerald-500 shadow-[0_0_8px_#10b981,0_0_15px_#10b981] z-10 pointer-events-none"
        ></motion.div>

        {/* QR Pixels Grid */}
        <div 
          style={{ gridTemplateColumns: "repeat(21, minmax(0, 1fr))" }} 
          className="grid gap-[1.5px] w-36 h-36 relative"
        >
          {grid.map((row, r) =>
            row.map((cell, c) => (
              <div
                key={`${r}-${c}`}
                className={`w-[6px] h-[6px] transition-colors duration-300 ${
                  cell ? "bg-black" : "bg-transparent"
                }`}
              ></div>
            ))
          )}

          {/* Central Logo Overlay */}
          <div className="absolute inset-0 m-auto w-8 h-8 bg-white border-2 border-neutral-100 rounded-lg flex items-center justify-center overflow-hidden shadow-md z-20">
            <span className="font-sans font-black text-[9px] text-[#0f3c75] tracking-tighter">
              UPI
            </span>
          </div>
        </div>
      </div>

      {/* Details label */}
      <div className="flex flex-col items-center text-center gap-0.5 mt-1">
        <span className="text-[11px] text-white font-mono font-bold">
          Amount: <span className="text-gold">{amount} INR</span>
        </span>
        <span className="text-[9px] text-neutral-500 font-sans max-w-[200px]">
          Works with GPay, PhonePe, Paytm, BHIM, and other Indian banking apps.
        </span>
      </div>
    </div>
  );
}
