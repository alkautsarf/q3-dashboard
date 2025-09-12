"use client";
import React from "react";
import TerminalLog from "./TerminalLog";
import Receipt from "./Receipt";
import TxStatus from "./TxStatus";
import { parseRecipientLine, isAddress } from "../lib/utils/validators";
import { useAccount, useDisconnect, usePublicClient, useWriteContract, useEnsName } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit"; // via RainbowKit docs
import { arbitrum, mainnet } from "wagmi/chains";
import type { Address, PublicClient } from "viem";
import { formatUnits } from "viem";
import {
  estimateBatchNative,
  estimateBatchErc20,
  estimateIndivNative,
  estimateIndivErc20,
  approveErc20,
  checkAllowance,
  getErc20Meta,
  toUnits,
  sendNative,
  sendErc20,
  getDisperseAddress,
} from "../lib/disperse";

type Recipient = { who: string; amount: string };

const greige = "#A59682"; // accent per AGENTS.md

export default function Terminal() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [selectedChainId, setSelectedChainId] = React.useState<number>(
    arbitrum.id
  );
  const publicClient = usePublicClient({ chainId: selectedChainId }); // via wagmi docs: usePublicClient
  const ensPublicClient = usePublicClient({ chainId: mainnet.id });
  const { writeContractAsync } = useWriteContract(); // via wagmi docs

  const [input, setInput] = React.useState("");
  const [lines, setLines] = React.useState<
    { id: number; content: React.ReactNode }[]
  >([
    // { id: 1, content: <span className="text-gray-600">Type /help to view available commands.</span> },
  ]);
  const [recipients, setRecipients] = React.useState<Recipient[]>([]);
  const [tokenAddress, setTokenAddress] = React.useState<Address | null>(null); // null => ETH
  const [tokenDecimals, setTokenDecimals] = React.useState<number>(18);
  const [tokenSymbol, setTokenSymbol] = React.useState<string>("ETH");
  const [tokenLabel, setTokenLabel] = React.useState<string>("ETH");
  const [stage, setStage] = React.useState<"editing" | "receipt" | "tx">(
    "editing"
  );
  const [gasBatch, setGasBatch] = React.useState<string | undefined>();
  const [gasIndiv, setGasIndiv] = React.useState<string | undefined>();
  const [userBalance, setUserBalance] = React.useState<string | undefined>();
  const [remaining, setRemaining] = React.useState<string | undefined>();
  const [totalDisplay, setTotalDisplay] = React.useState<string>("0");
  const [txHash, setTxHash] = React.useState<`0x${string}` | undefined>();
  // Tx status is monitored by <TxStatus />
  const idRef = React.useRef(2);
  const [clock, setClock] = React.useState<string>("");
  const { data: connectedEns } = useEnsName({ address, chainId: mainnet.id }); // via wagmi docs: useEnsName
  const announcedRef = React.useRef<string | null>(null);

  const formatTime = React.useCallback((d: Date) => {
    // Deterministic 24h clock + date: HH:MM:SS DD-MMM-YY
    const pad2 = (n: number) => n.toString().padStart(2, "0");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    const dd = pad2(d.getDate());
    const mmm = months[d.getMonth()];
    const yy = pad2(d.getFullYear() % 100);
    return `${hh}:${mm}:${ss} ${dd}-${mmm}-${yy}`;
  }, []);

  React.useEffect(() => {
    // via React docs: https://react.dev/reference/react/useEffect
    setClock(formatTime(new Date()));
    const id = setInterval(() => setClock(formatTime(new Date())), 1000);
    return () => clearInterval(id);
  }, [formatTime]);

  // Announce connection (ENS preferred)
  // React.useEffect(() => {
  //   if (!isConnected || !address) return;
  //   const label = connectedEns ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  //   if (announcedRef.current === label) return;
  //   announcedRef.current = label;
  //   pushNode(
  //     <span className="text-gray-700">Connected as <span className="font-mono">{label}</span></span>
  //   );
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [isConnected, address, connectedEns]);

  function pushNode(content: React.ReactNode) {
    setLines((s) => [...s, { id: idRef.current++, content }]);
  }
  function push(text: string) {
    pushNode(<span>{text}</span>);
  }

  // Removed Terminal-level tx monitoring; handled by <TxStatus />.

  function onEnter(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    pushNode(
      <span>
        <span className="text-green-600">❯ </span>
        <span className="text-black">{trimmed}</span>
      </span>
    );

    if (trimmed === "/help") {
      pushNode(
        <div className="text-sm font-mono space-y-1">
          <div>
            <span className="text-[#A07D5A]">/connect</span> — Open wallet modal
            and connect. Prints ENS or 0x… when connected.
          </div>
          <div>
            <span className="text-[#A07D5A]">/disconnect</span> — Hard reset:
            clear token, recipients, totals, and connection state.
          </div>

          <div>
            <span className="text-[#A07D5A]">/network &lt;name|id&gt;</span> —
            Switch chain (accepts name or chainId).
          </div>
          <div>
            <span className="text-[#A07D5A]">/network list</span> — Show
            supported chains.
          </div>
          <div>
            <span className="text-[#A07D5A]">/network active</span> — Show
            current active chain.
          </div>

          <div>
            <span className="text-[#A07D5A]">/token &lt;symbol|0x&gt;</span> —
            Select token (ETH or ERC-20 address).
          </div>
          <div>
            <span className="text-[#A07D5A]">/token list</span> — Show
            common/allowlisted tokens.
          </div>
          <div>
            <span className="text-[#A07D5A]">/token active</span> — Show
            currently selected token.
          </div>

          <div>
            <span className="text-[#A07D5A]">/done</span> — Compile &amp; show
            receipt (recipients, totals, live gas est.).
          </div>
          <div>
            <span className="text-[#A07D5A]">/abort</span> — Soft reset: clear
            recipients &amp; totals, keep connection &amp; token.
          </div>
          <div>
            <span className="text-[#A07D5A]">/clear</span> — Clear terminal output (keeps current token, recipients, and network).
          </div>
          <div>
            <span className="text-[#A07D5A]">/edit</span> — Return from receipt
            to editing recipients list.
          </div>
          <div>
            <span className="text-[#A07D5A]">/help</span> — Show this help.
          </div>

          <div className="mt-2 text-[#A07D5A]">
            Input (while editing recipients):
          </div>
          <div>
            <code>addressOrENS=amount</code> — Add a recipient row (e.g.,{" "}
            <code>elpabl0.eth=0.05</code> or <code>0xabc…=0.05</code>).
          </div>
        </div>
      );
      return;
    }
    if (trimmed.startsWith("/network")) {
      const parts = trimmed.split(/\s+/);
      const sub = parts[1]?.toLowerCase();
      if (!sub) {
        pushNode(
          <span className="text-red-600">
            /network needs an argument (use "mainnet" or "arbitrum" or chain
            id).
          </span>
        );
        return;
      }
      if (sub === "list") {
        pushNode(
          <span>
            Networks: <span className="font-mono">mainnet(1)</span>,{" "}
            <span className="font-mono">arbitrum(42161)</span>
          </span>
        );
        return;
      }
      if (sub === "active") {
        const label =
          selectedChainId === arbitrum.id
            ? "arbitrum(42161)"
            : selectedChainId === mainnet.id
            ? "mainnet(1)"
            : `chain(${selectedChainId})`;
        pushNode(
          <span>
            Active network: <span className="font-mono">{label}</span>
          </span>
        );
        return;
      }
      let target: number | null = null;
      if (sub === "arbitrum" || sub === String(arbitrum.id))
        target = arbitrum.id;
      if (sub === "mainnet" || sub === String(mainnet.id)) target = mainnet.id;
      if (!target) {
        pushNode(
          <span className="text-red-600">
            Unsupported network. Use /network list.
          </span>
        );
        return;
      }
      setSelectedChainId(target);
      pushNode(
        <span>
          Switched network to{" "}
          <span className="text-purple-600">
            {target === arbitrum.id ? "arbitrum" : "mainnet"}
          </span>
          .
        </span>
      );
      return;
    }
    if (trimmed.startsWith("/token")) {
      const parts = trimmed.split(/\s+/);
      const sub = parts[1]?.toLowerCase();
      if (!sub) {
        pushNode(
          <span className="text-red-600">
            /token needs an argument (common: ETH, ARB, USDC, LINK, USDS, UNI,
            AAVE, PEPE) or an ERC-20 0x address.
          </span>
        );
        return;
      }
      if (sub === "list") {
        pushNode(
          <span className="text-gray-700">
            Common tokens: ETH, ARB, USDC, LINK, USDS, UNI, AAVE, PEPE
          </span>
        );
        return;
      }
      if (sub === "active") {
        pushNode(
          <span>
            Active token:{" "}
            <span className="text-purple-600 font-medium">{tokenSymbol}</span>
          </span>
        );
        return;
      }
      if (sub === "eth") {
        setTokenAddress(null);
        setTokenDecimals(18);
        setTokenSymbol("ETH");
        setTokenLabel("ETH");
        pushNode(
          <span>
            Token selected:{" "}
            <span className="text-purple-600 font-medium">ETH</span>
          </span>
        );
        return;
      }
      if (!isAddress(sub)) {
        pushNode(
          <span className="text-red-600">
            Unknown token symbol. Use /token list or provide an ERC-20 0x
            address.
          </span>
        );
        return;
      }
      const addr = (sub as string).toLowerCase() as Address;
      (async () => {
        try {
          const c = publicClient as unknown as PublicClient;
          const { symbol, decimals } = await getErc20Meta(c, addr);
          setTokenAddress(addr);
          setTokenDecimals(decimals);
          setTokenSymbol(symbol);
          setTokenLabel(symbol.toUpperCase());
          pushNode(
            <span>
              Token selected:{" "}
              <span className="text-purple-600 font-medium">{symbol}</span>{" "}
              <span className="text-gray-600">({decimals}d)</span>
            </span>
          );
        } catch (e) {
          pushNode(
            <span className="text-red-600">Failed to read token metadata.</span>
          );
        }
      })();
      return;
    }
    if (trimmed === "/abort") {
      setRecipients([]);
      pushNode(
        <span className="text-gray-600">
          Aborted — recipients cleared. Back to token selection.
        </span>
      );
      return;
    }
    if (trimmed === "/done") {
      (async () => {
        try {
          if (!address) {
            pushNode(
              <span className="text-red-600">
                Connect wallet first with /connect.
              </span>
            );
            return;
          }
          const pub = publicClient as unknown as PublicClient;
          const addrs: Address[] = [];
          const vals: bigint[] = [];
          // Always fetch fresh token metadata to avoid stale decimals (e.g., USDC 6d)
          let decimals = 18;
          if (tokenAddress) {
            try {
              const meta = await getErc20Meta(pub, tokenAddress);
              decimals = meta.decimals;
              // keep UI state in sync (non-blocking)
              if (meta.decimals !== tokenDecimals) setTokenDecimals(meta.decimals);
              if (meta.symbol && meta.symbol !== tokenSymbol) setTokenSymbol(meta.symbol);
            } catch {}
          }
          const errors: string[] = [];
          for (const r of recipients) {
            let who: Address | null = null;
            try {
              if (r.who.endsWith(".eth")) {
                // via viem docs: getEnsAddress
                const resolved = await (
                  ensPublicClient as unknown as PublicClient
                ).getEnsAddress({ name: r.who });
                if (resolved) who = resolved as Address;
              } else if (isAddress(r.who)) {
                who = r.who as Address;
              }
            } catch {}
            if (!who) {
              errors.push(`Invalid address/ENS: ${r.who}`);
              continue;
            }
            try {
              const amt = toUnits(r.amount, decimals);
              addrs.push(who);
              vals.push(amt);
            } catch {
              errors.push(`Invalid amount: ${r.amount}`);
            }
          }
          if (errors.length)
            errors.forEach((m) =>
              pushNode(<span className="text-red-600">{m}</span>)
            );
          if (addrs.length === 0) {
            pushNode(
              <span className="text-red-600">No valid recipients.</span>
            );
            return;
          }
          const total = vals.reduce((a, b) => a + b, 0n);
          setTotalDisplay(formatUnits(total, decimals));
          // Balances
          let bal = 0n;
          if (!tokenAddress) {
            bal = await pub.getBalance({ address });
          } else {
            bal = (await pub.readContract({
              address: tokenAddress,
              abi: [
                {
                  type: "function",
                  stateMutability: "view",
                  name: "balanceOf",
                  inputs: [{ name: "account", type: "address" }],
                  outputs: [{ type: "uint256" }],
                },
              ],
              functionName: "balanceOf",
              args: [address],
            })) as bigint;
          }
          setUserBalance(formatUnits(bal, decimals));
          setRemaining(formatUnits(bal - total, decimals));
          // ERC-20 preflight: require balance >= total before proceeding
          if (tokenAddress && bal < total) {
            pushNode(
              <span className="text-red-600">
                Insufficient {tokenSymbol} balance: have {formatUnits(bal, decimals)}, need {formatUnits(total, decimals)}
              </span>
            );
            return;
          }
          // ERC-20 allowance preflight: ask for approval if insufficient
          const contract = getDisperseAddress();
          if (tokenAddress) {
            const allowancePre = await checkAllowance(pub, {
              token: tokenAddress,
              owner: address,
              spender: contract,
            });
            if (allowancePre < total) {
              pushNode(
                <span className="text-gray-600">Approval needed for {tokenSymbol}. Opening wallet…</span>
              );
              try {
                const approvalTx = await approveErc20(writeContractAsync, {
                  token: tokenAddress,
                  owner: address,
                  spender: contract,
                  amount: total,
                  chainId: selectedChainId,
                });
                // Show approval tx status with explorer link
                pushNode(<TxStatus label="Approval" chainId={selectedChainId} txHash={approvalTx} />);
                const rc = await pub.waitForTransactionReceipt({ hash: approvalTx });
                if (rc.status !== "success") {
                  pushNode(<span className="text-red-600">ApprovalFailed</span>);
                  return;
                }
                pushNode(
                  <span className="text-green-600">Approval confirmed. You can proceed.</span>
                );
              } catch (err: any) {
                pushNode(
                  <span className="text-red-600">ApprovalRejected or failed: {String(err?.shortMessage || err?.message || err)}</span>
                );
                return;
              }
            }
          }
          // Gas
          const batch = tokenAddress
            ? await estimateBatchErc20(pub, {
                contract,
                from: address,
                token: tokenAddress,
                recipients: addrs,
                values: vals,
              })
            : await estimateBatchNative(pub, {
                contract,
                from: address,
                recipients: addrs,
                values: vals,
                value: total,
              });
          const indiv = tokenAddress
            ? await estimateIndivErc20(pub, {
                from: address,
                token: tokenAddress,
                recipients: addrs,
                values: vals,
              })
            : await estimateIndivNative(pub, {
                from: address,
                recipients: addrs,
                values: vals,
              });
          setGasBatch(batch.toString());
          setGasIndiv(indiv.toString());
          pushNode(
            <Receipt
              token={tokenSymbol}
              items={recipients}
              total={formatUnits(total, decimals)}
              userBalance={formatUnits(bal, decimals)}
              remaining={formatUnits(bal - total, decimals)}
              gasBatch={batch.toString()}
              gasIndiv={indiv.toString()}
              onProceed={async () => {
                try {
                  if (!address) return;
                  const pubClient = publicClient as unknown as PublicClient;
                  const contract = getDisperseAddress();
                  if (tokenAddress) {
                    // Preflight balance check (ERC-20)
                    const balNow = (await pubClient.readContract({
                      address: tokenAddress,
                      abi: [
                        {
                          type: "function",
                          stateMutability: "view",
                          name: "balanceOf",
                          inputs: [{ name: "account", type: "address" }],
                          outputs: [{ type: "uint256" }],
                        },
                      ],
                      functionName: "balanceOf",
                      args: [address],
                    })) as bigint;
                    if (balNow < total) {
                      pushNode(
                        <span className="text-red-600">
                          Insufficient {tokenSymbol} balance: have {formatUnits(
                            balNow,
                            decimals
                          )}, need {formatUnits(total, decimals)}
                        </span>
                      );
                      setTxStatus("fail");
                      return;
                    }
                    const allowance = await checkAllowance(pubClient, {
                      token: tokenAddress,
                      owner: address,
                      spender: contract,
                    });
                    if (allowance < total) {
                      pushNode(
                        <span className="text-gray-600">
                          Approval needed for {tokenSymbol}. Requesting…
                        </span>
                      );
                      const tx = await approveErc20(writeContractAsync, {
                        token: tokenAddress,
                        owner: address,
                        spender: contract,
                        amount: total,
                        chainId: selectedChainId,
                      });
                      pushNode(<TxStatus label="Approval" chainId={selectedChainId} txHash={tx} />);
                      const rc = await pubClient.waitForTransactionReceipt({
                        hash: tx,
                      });
                      if (rc.status !== "success") {
                        pushNode(
                          <span className="text-red-600">ApprovalFailed</span>
                        );
                        return;
                      }
                    }
                    const hash = await sendErc20(writeContractAsync, {
                      contract,
                      from: address,
                      token: tokenAddress,
                      recipients: addrs,
                      values: vals,
                      chainId: selectedChainId,
                    });
                    setTxHash(hash);
                    pushNode(
                      <TxStatus
                        label="Batch"
                        chainId={selectedChainId}
                        txHash={hash}
                        gasBatch={batch.toString()}
                        gasIndiv={indiv.toString()}
                      />
                    );
                  } else {
                    const hash = await sendNative(writeContractAsync, {
                      contract,
                      from: address,
                      recipients: addrs,
                      values: vals,
                      value: total,
                      chainId: selectedChainId,
                    });
                    setTxHash(hash);
                    pushNode(
                      <TxStatus
                        label="Batch"
                        chainId={selectedChainId}
                        txHash={hash}
                        gasBatch={batch.toString()}
                        gasIndiv={indiv.toString()}
                      />
                    );
                  }
                  setStage("tx");
                } catch (err: any) {
                  pushNode(
                    <span className="text-red-600">
                      {String(err?.shortMessage || err?.message || err)}
                    </span>
                  );
                }
              }}
              onEdit={() => {
                setStage("editing");
                pushNode(
                  <span className="text-gray-600">Back to editing.</span>
                );
              }}
              onAbort={() => {
                setRecipients([]);
                setStage("editing");
                pushNode(
                  <span className="text-gray-600">
                    Aborted — recipients cleared.
                  </span>
                );
              }}
            />
          );
          setStage("receipt");
        } catch (e: any) {
          pushNode(
            <span className="text-red-600">
              Failed to compile receipt: {String(e?.message || e)}
            </span>
          );
        }
      })();
      return;
    }
    if (trimmed === "/clear") {
      setLines([]);
      return;
    }

    // Otherwise treat as a recipient line: addressOrENS=amount
    const parsed = parseRecipientLine(trimmed);
    if (!parsed.who || !parsed.amount) {
      pushNode(
        <span className="text-red-600">
          Invalid line. Use addressOrENS=amount or /help.
        </span>
      );
      return;
    }
    // Defer ENS resolution to /done; accept either .eth or 0x here
    setRecipients((rs) => [...rs, { who: parsed.who, amount: parsed.amount }]);
    pushNode(
      <span>
        Added: <span className="font-mono text-blue-700">{parsed.who}</span> ={" "}
        <span className="text-emerald-700">{parsed.amount}</span>{" "}
        <span className="text-purple-600">{tokenSymbol}</span>
      </span>
    );
  }

  return (
    <div className="glass-panel w-full overflow-hidden">
      {/* Single terminal pane: log + inline prompt */}
      <TerminalLog
        lines={lines}
        inputValue={input}
        placeholder={
          isConnected
            ? `Connected: ${
                connectedEns ?? address ? connectedEns ?? address : ""
              } • ${selectedChainId === arbitrum.id ? "ARB" : "MAINNET"}`
            : "Type /help to view available commands."
        }
        onChange={setInput}
        onEnter={() => {
          const trimmed = input.trim();
          if (!trimmed) return;
          if (trimmed === "/connect") {
            pushNode(
              <span className="text-gray-600">
                Opening wallet connect modal…
              </span>
            );
            openConnectModal?.();
          } else if (trimmed === "/disconnect") {
            if (isConnected) {
              disconnect();
              pushNode(<span className="text-gray-600">Disconnected.</span>);
            } else {
              pushNode(
                <span className="text-gray-600">Already disconnected.</span>
              );
            }
          } else {
            onEnter(input);
          }
          setInput("");
        }}
      />
      {/* Bottom status bar */}
      <div className="w-full bg-[#A59682] text-black font-mono text-xs px-2 py-1 flex items-center justify-between">
        <div>
          [{selectedChainId === arbitrum.id ? "ARB" : "MAINNET"}] 0:disperse
        </div>
        <div className="opacity-80">{clock}</div>
      </div>
    </div>
  );
}
