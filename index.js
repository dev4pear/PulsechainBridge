require("dotenv").config();
const {
  ADDRESS_OMNIBRIDGE,
  ADDRESS_SWAPROUTER,
  ADDRESS_TEST_OMNIBRIDGE,
  ADDRESS_TEST_SWAPROUTER,
  ETH_RPC_URL,
  SEPOLIA_RPC_URL,
  PULSE_RPC_URL,
  PULSETEST_RPC_URL,
} = require("./constants.js");
const ethers = require("ethers");
const omnibridgeAbi = require("./ABI/Omnibridge.json");
const swapRouterAbi = require("./ABI/SwapRouter.json");
const erc20Abi = require("./ABI/ERC20.json");

const SWAP_LIMIT = ethers.parseEther("0.1");
const isProd = process.env.NODE_ENV == "production" ? true : false;
const privateKey = process.env.PRIVATE_KEY;
const ethRpcUrl = isProd ? ETH_RPC_URL : SEPOLIA_RPC_URL;
const plsRpcUrl = isProd ? PULSE_RPC_URL : PULSETEST_RPC_URL;
const bridgeAddress = isProd ? ADDRESS_OMNIBRIDGE : ADDRESS_TEST_OMNIBRIDGE;
const routerAddress = isProd ? ADDRESS_SWAPROUTER : ADDRESS_TEST_SWAPROUTER;
const wethAddress = isProd
  ? "0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C"
  : "0x3677bd78CCf4d299328ECFBa61790cf8dBfcF686";
const wplsAddress = isProd
  ? "0x70499adEBB11Efd915E3b69E700c331778628707"
  : "0x70499adEBB11Efd915E3b69E700c331778628707";

const ethProvider = new ethers.JsonRpcProvider(ethRpcUrl);
const plsProvider = new ethers.JsonRpcProvider(plsRpcUrl);
const signer = new ethers.Wallet(privateKey);
const ethSigner = signer.connect(ethProvider);
const plsSigner = signer.connect(plsProvider);

const omnibridge = new ethers.Contract(bridgeAddress, omnibridgeAbi, ethSigner);
const weth = new ethers.Contract(wethAddress, erc20Abi, plsSigner);
const swapRouter = new ethers.Contract(routerAddress, swapRouterAbi, plsSigner);

console.log("signer:", signer.address);

const myWrap = async () => {
  const tx = await omnibridge.connect(ethSigner)["wrapAndRelayTokens()"]({
    value: ethers.parseEther("0.1"),
  });
  await tx.wait();
  console.log("bridge 0.1 eth from Ethereum to PulseChain: ", tx);
};

const main = async () => {
  await myWrap();
  plsProvider.on("block", async (blockNumber) => {
    const balance = await weth.balanceOf(signer.address);
    if (balance > SWAP_LIMIT) {
      const allowance = await weth.allowance(signer.address, routerAddress);
      if (allowance < balance) {
        const tx = await weth.approve(routerAddress, ethers.MaxUint256);
        await tx.wait();
      }
      const args = [balance, 0, [wethAddress, wplsAddress], signer.address];
      const estimatedAmount =
        await swapRouter.swapExactTokensForTokensV1.staticCall(...args);
      args[1] = (estimatedAmount * 995n) / 1000n;
      const tx = await swapRouter.swapExactTokensForTokensV1(...args);
      await tx.wait();
      console.log(tx);
    }
  });
};
main();
