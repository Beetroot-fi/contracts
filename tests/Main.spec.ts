import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { Main } from '../wrappers/Main';
import { JettonMinter } from "../wrappers/Stablecoin"
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary } from '../helpers/utils';
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';

describe('Main', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Main');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let main: SandboxContract<Main>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        // setup time 
        blockchain.now = 500;

        deployer = await blockchain.treasury('deployer');

        // jetton wallet governed
        const jettonWalletCodeRaw = await compile('JettonWallet');
        const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw);

        // jetton wallet
        const jettonWalletCommonCode = await compile('JettonWalletCommon')

        // deploy usdt master
        const stablecoin = blockchain.openContract(JettonMinter.createFromConfig({
            admin: deployer.address,
            wallet_code: jettonWalletCode,
            jetton_content: { uri: "https://raw.githubusercontent.com/Beetroot-fi/contracts/refs/heads/master/testnet-usdt-metadata.json" }
        }, await compile('Stablecoin')));

        const deployResultUsdt = await stablecoin.sendDeploy(deployer.getSender(), toNano('1.5'));
        expect(deployResultUsdt.transactions).toHaveTransaction({
            from: deployer.address,
            to: stablecoin.address,
            deploy: true,
            success: true,
        });

        // mint usdt for deployer
        const mintUsdtForDepolyerResult = await stablecoin.sendMint(
            deployer.getSender(),
            deployer.address,
            toNano('600'),
        );
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: stablecoin.address,
            success: true,
        });
        const deployerUsdtJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(await stablecoin.getWalletAddress(deployer.address)));
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: stablecoin.address,
            to: deployerUsdtJettonWallet.address,
            deploy: true,
        });

        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: deployer.address,
            op: 0x7362d09c,
        });

        // deploy beetroot master
        const jettonMaster = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: toNano('864239'),
            adminAddress: deployer.address,
            content: beginCell()
                .storeUint(0x01, 8)
                .storeStringTail('https://raw.githubusercontent.com/welaskez/test-jetton-metadata/refs/heads/main/metadata.json')
                .endCell(),
            jettonWalletCode: jettonWalletCommonCode,
        }, await compile('JettonMaster')));

        const deployResultJettonMaster = await jettonMaster.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResultJettonMaster.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            deploy: true,
            success: true,
        });

        // deploy main sc
        main = blockchain.openContract(Main.createFromConfig({
            usdtJettonMasterAddress: stablecoin.address,
            usdtJettonWalletCode: jettonWalletCode,
            rootMasterAddress: jettonMaster.address,
            userScCode: await compile('User'),
            adminAddress: deployer.address,
            jettonWalletCode: jettonWalletCommonCode,
        }, code));

        const deployResult = await main.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            deploy: true,
        });

        // change beetroot jetton master owner to main sc
        const changeOwnerResult = await jettonMaster.sendChangeAdmin(
            deployer.getSender(),
            toNano('0.3'),
            {
                queryId: 0n,
                newAdminAddress: main.address,
            }
        )
        expect(changeOwnerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: true,
        });
    });

    it('should deploy user sc, mint beetroot & send reward for admins if receive usdt', async () => {

    });
});
