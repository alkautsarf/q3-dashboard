"use client";

import React from "react";
import { motion } from "framer-motion";

interface TokenItem {
  symbol: string;
  name?: string;
  href?: string;
  balance: number;
  balanceDisplay?: string;
  price?: number;
  usdValue?: number;
  change24h?: number; // percentage change
  icon?: string;
  loading?: boolean; // row-level loading state for price fields
  spam?: boolean;
  noPrice?: boolean; // explicitly flagged when CG has no data
}

interface TokensListProps {
  items?: TokenItem[];
  loadingPrices?: boolean;
}

const TokenRow: React.FC<{ item: TokenItem; index: number; loadingPrices?: boolean }> = ({ item, index, loadingPrices }) => {
  const formatBalance = (display?: string, numeric?: number) => {
    // Prefer preformatted string (no rounding). Truncate for readability.
    if (display && typeof display === "string") {
      const [intPartRaw, fracPartRaw = ""] = display.split(".");
      const intPart = intPartRaw || "0";
      const isLessThanOne = intPart === "0";
      const keep = isLessThanOne ? 6 : 4;
      const truncatedFrac = fracPartRaw.slice(0, keep).replace(/0+$/, "");
      const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return truncatedFrac ? `${intWithSep}.${truncatedFrac}` : intWithSep;
    }
    // Fallback to numeric formatting (may round slightly)
    if (typeof numeric === "number" && Number.isFinite(numeric)) {
      const isLessThanOne = Math.abs(numeric) < 1;
      const maxFrac = isLessThanOne ? 6 : 4;
      return numeric.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxFrac,
      });
    }
    return "0";
  };
  const formatPrice = (n?: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    if (abs >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 0.01) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    if (abs >= 0.0001) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
    if (abs > 0) return "<0.0001";
    return "0";
  };
  const formatUsd = (n?: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    if (abs >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 0.01) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    if (abs >= 0.0001) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
    if (abs > 0) return "<0.0001";
    return "0";
  };
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.25) }}
      className="odd:bg-white even:bg-gray-50 hover:bg-gray-100 transition-colors border-b-2 border-black first:border-t-2 first:border-black last:border-b-0"
    >
      {/* Token */}
      <td className="px-4 py-2 flex items-center gap-2">
        {item.icon ? (
          <img
            src={item.icon}
            alt={item.symbol}
            className="w-6 h-6 rounded-full ring-1 ring-gray-200"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-[10px] text-gray-600"
            title={item.symbol}
          >
            {item.symbol?.slice(0, 2) || ""}
          </span>
        )}
        {item.href ? (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-black font-medium hover:text-[#A59682] transition-colors"
            title={item.name || item.symbol}
          >
            {item.name || item.symbol}
          </a>
        ) : (
          <span className="text-black font-medium">{item.name || item.symbol}</span>
        )}
      </td>

      {/* Price */}
      <td className="px-4 py-2 text-sm text-gray-700 text-right tabular-nums">
        {item.spam || item.noPrice ? (
          <span className="text-gray-400">n/a</span>
        ) : (item.loading ?? loadingPrices) ? (
          <span className="inline-block h-4 w-16 rounded bg-gray-200 animate-pulse" />
        ) : item.price !== undefined ? (
          `$${formatPrice(item.price)}`
        ) : (
          ""
        )}
      </td>

      {/* 24h Change */}
      <td
        className={`px-4 py-2 text-sm font-medium text-right tabular-nums hidden sm:table-cell ${
          item.spam || item.noPrice
            ? "text-gray-400"
            : item.change24h !== undefined
            ? item.change24h === 0
              ? "text-gray-400"
              : item.change24h > 0
              ? "text-green-600"
              : "text-red-600"
            : "text-gray-400"
        }`}
      >
        {item.spam || item.noPrice
          ? "n/a"
          : (item.loading ?? loadingPrices)
          ? <span className="inline-block h-4 w-12 rounded bg-gray-200 animate-pulse" />
          : item.change24h !== undefined
          ? `${item.change24h > 0 ? "+" : ""}${item.change24h === 0 ? 0 : item.change24h}%`
          : ""}
      </td>

      {/* Balance */}
      <td className="px-4 py-2 text-sm text-gray-700 text-right tabular-nums">{formatBalance(item.balanceDisplay, item.balance)}</td>

      {/* USD Value */}
      <td className="px-4 py-2 text-sm text-gray-900 font-medium text-right tabular-nums">
        {item.spam || item.noPrice ? (
          <span className="text-gray-400">n/a</span>
        ) : (item.loading ?? loadingPrices) ? (
          <span className="inline-block h-4 w-20 rounded bg-gray-200 animate-pulse" />
        ) : item.usdValue !== undefined ? (
          `$${formatUsd(item.usdValue)}`
        ) : (
          ""
        )}
      </td>
    </motion.tr>
  );
};

const TokensList: React.FC<TokensListProps> = ({ items = [], loadingPrices = false }) => {
  const totalValue = items.reduce((sum, t) => sum + (t.usdValue ?? 0), 0);

  return (
    <div className="w-full border-2 border-black rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2 border-b-2 border-black bg-white/70 sticky top-0 z-10">
        <p className="font-bold text-black">Token Holdings</p>
        <p className="text-black text-sm">
          {loadingPrices ? (
            <span className="inline-block h-4 w-28 rounded bg-gray-200 animate-pulse" />
          ) : (
            <>
              Total Value:{" "}
              <span className="font-semibold">{totalValue > 0 ? `$${totalValue.toLocaleString()}` : "—"}</span>
            </>
          )}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                Token
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                Price
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700 hidden sm:table-cell">
                24h %
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                Amount
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                USD Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {items.map((item, index) => (
              <TokenRow key={index} item={item} index={index} loadingPrices={loadingPrices} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TokensList;
