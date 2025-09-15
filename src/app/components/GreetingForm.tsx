"use client";

import React, { useMemo, useState } from "react";
import GlassCard from "@/app/components/Shared/GlassCard";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
  useSignTypedData,
} from "wagmi"; // via wagmi docs: https://wagmi.sh/react
import { arbitrum } from "wagmi/chains";
import {
  formatEther,
  parseEther,
  parseUnits,
  keccak256,
  toHex,
  encodeAbiParameters,
} from "viem";
import {
  ARBITRUM_CHAIN_ID,
  GREETING_ADDRESS,
  greetingAbi,
  erc20Abi,
  PERMIT2_ADDRESS,
} from "@/app/lib/greeting";
import TxStatus from "@/app/components/TxStatus";
import TokenSelector from "@/app/components/TokenSelector";
import NetworkSelector, {
  type NetworkKey,
} from "@/app/components/NetworkSelector";

type Payment = "free" | "eth" | "erc20";

export default function GreetingForm() {
  const { isConnected, address: ownerAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract(); // via wagmi docs
  const pub = usePublicClient({ chainId: ARBITRUM_CHAIN_ID });
  const { signTypedDataAsync } = useSignTypedData();

  const [text, setText] = useState("");
  const [payment, setPayment] = useState<Payment>("free");
  const [ethAmount, setEthAmount] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [tx, setTx] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenAddr, setTokenAddr] = useState<`0x${string}` | "">("");
  const [tokenAmount, setTokenAmount] = useState("0");
  const [permitPath, setPermitPath] = useState<"2612" | "permit2" | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [allowanceOk, setAllowanceOk] = useState<boolean>(false);
  const [approvalTx, setApprovalTx] = useState<`0x${string}` | null>(null);
  const [allowanceIsMax, setAllowanceIsMax] = useState<boolean>(false);
  const MAX_UINT256 = (1n << 256n) - 1n;
  const STD_PERMIT_TYPEHASH = React.useMemo(
    () =>
      keccak256(
        toHex(
          "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        )
      ),
    []
  );
  const [eip2612Domain, setEip2612Domain] = useState<{
    name: string;
    version: string;
  } | null>(null);

  // Compute a robust deadline: latest block timestamp + 1 hour
  async function computeDeadline(): Promise<bigint> {
    try {
      if (pub) {
        const blk: any = await (pub as any).getBlock({ blockTag: "latest" });
        const ts: bigint = blk.timestamp as bigint;
        return ts + 3600n;
      }
    } catch {}
    return BigInt(Math.floor(Date.now() / 1000) + 3600);
  }

  // Generate a 256-bit random nonce per Uniswap Permit2 spec (unordered nonces)
  function randomNonce256(): bigint {
    try {
      const buf = new Uint8Array(32);
      // browser crypto for strong randomness
      if (
        typeof window !== "undefined" &&
        (window as any).crypto?.getRandomValues
      ) {
        (window as any).crypto.getRandomValues(buf);
      } else {
        // fallback (less secure): Math.random
        for (let i = 0; i < buf.length; i++)
          buf[i] = Math.floor(Math.random() * 256);
      }
      let hex = "0x";
      for (let i = 0; i < buf.length; i++)
        hex += buf[i].toString(16).padStart(2, "0");
      return BigInt(hex);
    } catch {
      // very unlikely fallback
      return (
        (BigInt(Date.now()) << 128n) ^ BigInt(Math.floor(Math.random() * 1e9))
      );
    }
  }

  const onSubmit = async () => {
    setError(null);
    setTx(null);
    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }
    if (chainId !== ARBITRUM_CHAIN_ID) {
      try {
        switchChain?.({ chainId: arbitrum.id });
      } catch {}
      setError("Please switch to Arbitrum.");
      return;
    }
    if (!text || text.trim().length === 0) {
      setError("Enter a greeting first.");
      return;
    }
    try {
      setSubmitting(true);
      if (payment === "free" || payment === "eth") {
        const value = payment === "eth" ? parseEther(ethAmount || "0") : 0n;
        const hash = await writeContractAsync({
          abi: greetingAbi,
          address: GREETING_ADDRESS,
          functionName: "setGreetingETH",
          args: [text],
          chainId: arbitrum.id,
          value,
        }); // via wagmi docs: useWriteContract
        setTx(hash);
      } else {
        // ERC-20 handled by explicit buttons below
        return;
      }
    } catch (e: any) {
      setError(String(e?.shortMessage || e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  // Detect permit path, decimals, symbol, and allowance whenever inputs change
  React.useEffect(() => {
    (async () => {
      try {
        if (!pub || !tokenAddr || !ownerAddress) return;
        const [dec, sym] = await Promise.all([
          pub.readContract({
            address: tokenAddr as `0x${string}`,
            abi: erc20Abi,
            functionName: "decimals",
          }) as Promise<number>,
          pub.readContract({
            address: tokenAddr as `0x${string}`,
            abi: erc20Abi,
            functionName: "symbol",
          }) as Promise<string>,
        ]);
        setDecimals(dec);
        setSymbol(sym);
        let path: "2612" | "permit2" = "permit2";
        try {
          const n = (await pub.readContract({
            address: tokenAddr as `0x${string}`,
            abi: erc20Abi,
            functionName: "nonces",
            args: [ownerAddress],
          })) as any;
          if (typeof n === "bigint") path = "2612";
        } catch {}
        // Validate standard PERMIT_TYPEHASH; if present and not equal → fallback to Permit2
        if (path === "2612") {
          try {
            const onchainTypehash = (await pub.readContract({
              address: tokenAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: "PERMIT_TYPEHASH",
            })) as `0x${string}`;
            if (
              onchainTypehash.toLowerCase() !==
              STD_PERMIT_TYPEHASH.toLowerCase()
            ) {
              path = "permit2"; // nonstandard (e.g., DAI) → fallback
            }
          } catch {
            // if not exposed, continue with further domain validation below
          }
        }
        setPermitPath(path);
        // allowance check for Permit2
        if (path === "permit2") {
          const fee = dec != null ? parseUnits(tokenAmount || "0", dec) : 0n;
          if (fee > 0n) {
            const allowance = (await pub.readContract({
              address: tokenAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: "allowance",
              args: [ownerAddress, PERMIT2_ADDRESS],
            })) as bigint;
            setAllowanceOk(allowance >= fee);
            setAllowanceIsMax(allowance === MAX_UINT256);
          } else {
            setAllowanceOk(false);
            setAllowanceIsMax(false);
          }
        } else {
          setAllowanceOk(true); // not needed for 2612
          setAllowanceIsMax(false);
          // Build EIP-2612 domain and validate DOMAIN_SEPARATOR
          try {
            const name = (await pub.readContract({
              address: tokenAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: "name",
            })) as string;
            // Try `version()` first; if missing or invalid, try "2" then "1" to match DOMAIN_SEPARATOR
            let versionRead: string | null = null;
            try {
              versionRead = (await pub.readContract({
                address: tokenAddr as `0x${string}`,
                abi: erc20Abi,
                functionName: "version",
              })) as string;
            } catch {}
            const domainSepOnChain = (await pub.readContract({
              address: tokenAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: "DOMAIN_SEPARATOR",
            })) as `0x${string}`;

            const typeHash = keccak256(
              toHex(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
              )
            );
            const computeSep = (ver: string) =>
              keccak256(
                encodeAbiParameters(
                  [
                    { type: "bytes32" },
                    { type: "bytes32" },
                    { type: "bytes32" },
                    { type: "uint256" },
                    { type: "address" },
                  ],
                  [
                    typeHash,
                    keccak256(toHex(name)),
                    keccak256(toHex(ver)),
                    BigInt(arbitrum.id),
                    tokenAddr as `0x${string}`,
                  ]
                )
              );
            let chosenVersion: string | null = null;
            const candidates = [versionRead, "2", "1"].filter(
              Boolean
            ) as string[];
            for (const ver of candidates) {
              if (
                computeSep(ver).toLowerCase() === domainSepOnChain.toLowerCase()
              ) {
                chosenVersion = ver;
                break;
              }
            }
            if (chosenVersion) {
              setEip2612Domain({ name, version: chosenVersion });
            } else {
              // domain mismatch → fallback to Permit2 to avoid signature mismatch
              setPermitPath("permit2");
            }
          } catch {
            // if DOMAIN_SEPARATOR missing, fallback to Permit2
            setPermitPath("permit2");
          }
        }
      } catch (e) {
        // soft fail
      }
    })();
  }, [pub, tokenAddr, ownerAddress, tokenAmount]);

  const ethDisabled = useMemo(() => payment !== "eth", [payment]);

  return (
    <GlassCard title="Greeting Form" className="w-full">
      <div className="space-y-4">
        {/* Network selector (reuse component; arbitrum-only behavior) */}
        <div className="flex items-center gap-3">
          <div className="text-sm ">Network</div>
          <div className="ml-auto">
            <NetworkSelector
              value={
                chainId === ARBITRUM_CHAIN_ID
                  ? ("arbitrum" as NetworkKey)
                  : ("mainnet" as NetworkKey)
              }
              onChange={(next) => {
                if (next === "arbitrum")
                  switchChain?.({ chainId: arbitrum.id });
                else if (next === "mainnet") switchChain?.({ chainId: 1 });
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm">Greeting</label>
        </div>
        <textarea
          rows={4}
          placeholder="Write something nice…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full resize-none px-3 py-2 border-2 border-black rounded-lg focus:outline-none focus:ring-black"
        />

        {/* Payment selector */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Payment:</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pay"
                checked={payment === "free"}
                onChange={() => setPayment("free")}
                className="accent-black cursor-pointer"
              />
              Free
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pay"
                checked={payment === "eth"}
                onChange={() => setPayment("eth")}
                className="accent-black cursor-pointer"
              />
              ETH
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pay"
                checked={payment === "erc20"}
                onChange={() => setPayment("erc20")}
                className="accent-black cursor-pointer"
              />
              ERC‑20 (permit)
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.0001"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            disabled={ethDisabled}
            className="w-40 px-3 py-2 border-2 border-black rounded-lg focus:outline-none disabled:opacity-50"
          />
          <span className="text-sm">ETH</span>
        </div>

        {/* ERC-20 input group */}
        {payment === "erc20" && (
          <div className="space-y-3">
            <TokenSelector value={tokenAddr} onChange={setTokenAddr} />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                className="w-40 px-3 py-2 border-2 border-black rounded-lg focus:outline-none"
              />
              <span className="text-sm">Amount</span>
            </div>
            <div className="text-sm text-gray-600">
              Path: {permitPath === "2612" ? "EIP‑2612 Permit" : "Permit2"}
              {decimals != null && symbol ? ` • ${symbol}` : ""}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  try {
                    setError(null);
                    if (!pub || !tokenAddr || !ownerAddress || decimals == null)
                      return;
                    const fee = parseUnits(tokenAmount || "0", decimals);
                    if (fee <= 0n) {
                      setError("Enter a positive token amount.");
                      return;
                    }
                    if (permitPath === "2612") {
                      const deadline = await computeDeadline(); // block.timestamp + 1 hour
                      const domain = {
                        name: eip2612Domain?.name || "",
                        version: eip2612Domain?.version || "1",
                        chainId: arbitrum.id,
                        verifyingContract: tokenAddr as `0x${string}`,
                      } as const;
                      const types = {
                        Permit: [
                          { name: "owner", type: "address" },
                          { name: "spender", type: "address" },
                          { name: "value", type: "uint256" },
                          { name: "nonce", type: "uint256" },
                          { name: "deadline", type: "uint256" },
                        ],
                      } as const;
                      const nonce = (await pub.readContract({
                        address: tokenAddr as `0x${string}`,
                        abi: erc20Abi,
                        functionName: "nonces",
                        args: [ownerAddress],
                      })) as bigint;
                      const message = {
                        owner: ownerAddress,
                        spender: GREETING_ADDRESS,
                        value: fee,
                        nonce,
                        deadline,
                      } as const;
                      const signature = await signTypedDataAsync({
                        domain,
                        types,
                        primaryType: "Permit",
                        message,
                      });
                      const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
                      const s = `0x${signature.slice(
                        66,
                        130
                      )}` as `0x${string}`;
                      const v = parseInt(signature.slice(130, 132), 16);
                      const hash = await writeContractAsync({
                        abi: greetingAbi,
                        address: GREETING_ADDRESS,
                        functionName: "setGreetingWithPermit2612",
                        args: [tokenAddr, fee, deadline, v, r, s, text],
                        chainId: arbitrum.id,
                      });
                      setTx(hash);
                    } else {
                      // Ensure Permit2 has ERC20 allowance, or grant MAX first
                      try {
                        const current = (await pub.readContract({
                          address: tokenAddr as `0x${string}`,
                          abi: erc20Abi,
                          functionName: "allowance",
                          args: [ownerAddress, PERMIT2_ADDRESS],
                        })) as bigint;
                        if (current < fee) {
                          const approveHash = await writeContractAsync({
                            abi: erc20Abi,
                            address: tokenAddr as `0x${string}`,
                            functionName: "approve",
                            args: [PERMIT2_ADDRESS, MAX_UINT256],
                            chainId: arbitrum.id,
                          });
                          setApprovalTx(approveHash);
                          await pub.waitForTransactionReceipt({
                            hash: approveHash,
                          });
                        }
                      } catch {}
                      const nonceP2 = randomNonce256();
                      const domain = {
                        name: "Permit2",
                        chainId: arbitrum.id,
                        verifyingContract: PERMIT2_ADDRESS,
                      } as const;
                      const types = {
                        TokenPermissions: [
                          { name: "token", type: "address" },
                          { name: "amount", type: "uint256" },
                        ],
                        PermitTransferFrom: [
                          { name: "permitted", type: "TokenPermissions" },
                          { name: "spender", type: "address" },
                          { name: "nonce", type: "uint256" },
                          { name: "deadline", type: "uint256" },
                        ],
                      } as const;
                      const deadlineP2 = await computeDeadline(); // block.timestamp + 1 hour
                      const message = {
                        permitted: {
                          token: tokenAddr as `0x${string}`,
                          amount: fee,
                        },
                        spender: GREETING_ADDRESS,
                        nonce: nonceP2,
                        deadline: deadlineP2,
                      } as const;
                      const signature = await signTypedDataAsync({
                        domain,
                        types,
                        primaryType: "PermitTransferFrom",
                        message,
                      });
                      const hash = await writeContractAsync({
                        abi: greetingAbi,
                        address: GREETING_ADDRESS,
                        functionName: "setGreetingWithPermit2",
                        args: [
                          tokenAddr,
                          fee,
                          {
                            permitted: { token: tokenAddr, amount: fee },
                            nonce: nonceP2,
                            deadline: deadlineP2,
                          },
                          signature as `0x${string}`,
                          text,
                        ],
                        chainId: arbitrum.id,
                      });
                      setTx(hash);
                    }
                  } catch (e: any) {
                    setError(String(e?.shortMessage || e?.message || e));
                  }
                }}
                disabled={
                  !tokenAddr || decimals == null || !tokenAmount || submitting
                }
                className="px-3 py-2 border-2 border-black rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-60 cursor-pointer"
              >
                Sign Permit & Set Greeting
              </button>
            </div>
            {approvalTx && (
              <div className="pt-2">
                <TxStatus
                  label="Approve Permit2"
                  txHash={approvalTx}
                  chainId={arbitrum.id}
                />
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {(payment === "free" || payment === "eth") && (
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-black text-white rounded-lg hover:opacity-90 transition cursor-pointer border-2 border-black disabled:opacity-60"
          >
            {submitting
              ? "Submitting…"
              : payment === "free"
              ? "Post Free Greeting"
              : `Post with ${ethAmount || 0} ETH`}
          </button>
        )}

        {tx && (
          <div className="pt-4">
            <TxStatus
              label={payment === "eth" ? "Greeting (ETH)" : "Greeting"}
              txHash={tx}
              chainId={arbitrum.id}
            />
          </div>
        )}
      </div>
    </GlassCard>
  );
}
