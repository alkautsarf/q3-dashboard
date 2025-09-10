import { ConnectButton } from "@rainbow-me/rainbowkit";

const ConnectButtonCustom = () => {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        // Note: If your app doesn't use authentication, you
        // can remove all 'authenticationStatus' checks
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className={`
                    relative z-0 flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border-[1px] 
                    border-neutral-700 px-4 py-1.5 font-medium
                   text-black transition-all duration-300
                    
                    before:absolute before:inset-0
                    before:-z-10 before:translate-y-[200%]
                    before:scale-[2.5]
                    before:rounded-[100%] before:bg-black
                    before:transition-transform before:duration-1000
                    before:content-[""]
            
                    hover:scale-105 hover:border-neutral-50 hover:text-white
                    hover:before:translate-y-[0%]
                    active:scale-100 cursor-pointer`}
                    type="button"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="text-red-500"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={openAccountModal}
                    className={`
                    relative z-0 flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border-[1px] 
                    border-neutral-700 px-4 py-1.5 font-medium
                   text-black transition-all duration-300
                    
                    before:absolute before:inset-0
                    before:-z-10 before:translate-y-[200%]
                    before:scale-[2.5]
                    before:rounded-[100%] before:bg-black
                    before:transition-transform before:duration-1000
                    before:content-[""]
            
                    hover:scale-105 hover:border-neutral-50 hover:text-white
                    hover:before:translate-y-[0%]
                    active:scale-100 cursor-pointer`}
                    type="button"
                  >
                    Connected
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default ConnectButtonCustom;
