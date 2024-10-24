import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { Main } from '../wrappers/Main';
import { JettonMinter } from "../wrappers/Stablecoin"
import { compile } from '@ton/blueprint';
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonWalletCommon } from '../wrappers/JettonWalletCommon';
import { User } from '../wrappers/User';
import '@ton/test-utils';

describe('Main', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Main');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let main: SandboxContract<Main>;
    let usdtMaster: SandboxContract<JettonMinter>;
    let deployerUsdtJettonWallet: SandboxContract<JettonWallet>;
    let mainUsdtJettonWallet: SandboxContract<JettonWallet>;
    let deployerBeetrootJettonWallet: SandboxContract<JettonWalletCommon>;
    let beetrootMaster: SandboxContract<JettonMaster>;
    let deployerUserSc: SandboxContract<User>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        // setup time 
        blockchain.now = 500;

        deployer = await blockchain.treasury('deployer');

        // jetton wallet governed
        const jettonWalletCodeRaw = await compile('JettonWallet');

        // install libs on blockchain
        const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
        _libs.set(BigInt(`0x${jettonWalletCodeRaw.hash().toString('hex')}`), jettonWalletCodeRaw);
        const libs = beginCell().storeDictDirect(_libs).endCell();
        blockchain.libs = libs;
        let lib_prep = beginCell().storeUint(2, 8).storeBuffer(jettonWalletCodeRaw.hash()).endCell();
        const jettonWalletCode = new Cell({ exotic: true, bits: lib_prep.bits, refs: lib_prep.refs });

        // jetton wallet
        const jettonWalletCommonCode = await compile('JettonWalletCommon');

        // deploy usdt master
        usdtMaster = blockchain.openContract(JettonMinter.createFromConfig({
            admin: deployer.address,
            wallet_code: jettonWalletCode,
            jetton_content: { uri: "https://raw.githubusercontent.com/welaskez/testnet-usdt-metadata/refs/heads/main/metadata.json" }
        }, await compile('Stablecoin')));

        const deployResultUsdt = await usdtMaster.sendDeploy(deployer.getSender(), toNano('1.5'));
        expect(deployResultUsdt.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtMaster.address,
            deploy: true,
            success: true,
        });

        // mint usdt for deployer
        const mintUsdtForDepolyerResult = await deployer.send({
            to: usdtMaster.address,
            value: toNano('1.5'),
            body: beginCell()
                .storeUint(0x642b7d07, 32)
                .storeUint(0, 64)
                .storeAddress(deployer.address)
                .storeCoins(toNano('0.1'))
                .storeRef(beginCell()
                    .storeUint(0x178d4519, 32)
                    .storeUint(0, 64)
                    .storeCoins(toNano('3000'))
                    .storeAddress(deployer.address)
                    .storeAddress(deployer.address)
                    .storeCoins(toNano('0.05'))
                    .storeUint(0, 1)
                    .endCell())
                .endCell(),
        });
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtMaster.address,
            success: true,
            op: 1680571655 // 0x642b7d07 - mint usdt jetton master
        });

        deployerUsdtJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: deployer.address,
            jettonMasterAddress: usdtMaster.address,
        }, jettonWalletCode));
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: usdtMaster.address,
            to: deployerUsdtJettonWallet.address,
            deploy: true,
            success: true,
        });

        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: deployer.address,
            success: true,
            op: 1935855772, // 0x7362d09c - transfer_notification
        });

        // deploy beetroot master
        beetrootMaster = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: toNano('1000000000'),
            adminAddress: deployer.address,
            content: beginCell()
                .storeUint(0x01, 8)
                .storeStringTail('https://raw.githubusercontent.com/welaskez/test-jetton-metadata/refs/heads/main/metadata.json')
                .endCell(),
            jettonWalletCode: jettonWalletCommonCode,
        }, await compile('JettonMaster')));

        const deployResultJettonMaster = await beetrootMaster.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResultJettonMaster.transactions).toHaveTransaction({
            from: deployer.address,
            to: beetrootMaster.address,
            deploy: true,
            success: true,
        });

        // deploy main sc
        main = blockchain.openContract(Main.createFromConfig({
            usdtJettonMasterAddress: usdtMaster.address,
            usdtJettonWalletCode: jettonWalletCode,
            rootMasterAddress: beetrootMaster.address,
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
        const changeOwnerResult = await beetrootMaster.sendChangeAdmin(
            deployer.getSender(),
            toNano('0.3'),
            {
                queryId: 0n,
                newAdminAddress: main.address,
            }
        )
        expect(changeOwnerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: beetrootMaster.address,
            success: true,
            op: 3, // change admin
        });
        let beetrootMasterData = await beetrootMaster.getJettonData();
        expect(beetrootMasterData.adminAddress).toEqualAddress(main.address);

        // getting main usdt jetton wallet
        const mainJettonWalletAddress = await usdtMaster.getWalletAddress(main.address);
        mainUsdtJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(mainJettonWalletAddress));

        // getting main beetroot jetton wallet
        let deployerBeetrootJettonWalletAddress = await beetrootMaster.getWalletAddress(deployer.address);
        deployerBeetrootJettonWallet = blockchain.openContract(JettonWalletCommon.createFromAddress(deployerBeetrootJettonWalletAddress));

        deployerUserSc = blockchain.openContract(User.createFromAddress(await main.getUserScAddress(deployer.address)));
    });

    it('should deploy user sc, mint beetroot & send reward for admins if receive usdt', async () => {
        const result = await deployer.send({
            to: deployerUsdtJettonWallet.address,
            value: toNano('1'),
            body: beginCell()
                .storeUint(0xf8a7ea5, 32)
                .storeUint(0, 64)
                .storeCoins(BigInt(200 * 1e6))
                .storeAddress(main.address)
                .storeAddress(deployer.address)
                .storeMaybeRef(null)
                .storeCoins(toNano('0.3'))
                .storeMaybeRef(null)
                .endCell()
        });

        // check trasnfer usdt
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerUsdtJettonWallet.address,
            success: true,
            op: 260734629, // 0xf8a7ea5 - tranfer
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: 395134233 // 0x178d4519 - internal_transfer
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: main.address,
            success: true,
            op: 1935855772 // 0x7362d09c - transfer_notification
        });

        // check deploy user sc
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: deployerUserSc.address,
            success: true,
            deploy: true,
            op: 20, // deposit
        });
        let userScData = await deployerUserSc.getUserData();
        expect(userScData.adminAddress).toEqualAddress(deployer.address);
        expect(userScData.balance).toEqual(BigInt(200 * 1e6));
        expect(userScData.depositTimestamp).toEqual(500n);
        expect(userScData.unlockTimestamp).toEqual(0n);
        expect(userScData.mainScAddress).toEqualAddress(main.address);
        expect(userScData.rootMasterAddress).toEqualAddress(beetrootMaster.address)

        // check mint beetroot
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: beetrootMaster.address,
            success: true,
            op: 21, // mint default jetton master
        });
        expect(result.transactions).toHaveTransaction({
            from: beetrootMaster.address,
            to: deployerBeetrootJettonWallet.address,
            success: true,
            op: 395134233, // 0x178d4519 - internal_transfer
        });
        let deployerBeetrootJettonWalletData = await deployerBeetrootJettonWallet.getWalletData();
        expect(deployerBeetrootJettonWalletData.balance).toEqual(toNano('2'));

        // check sending profit to admins
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: 260734629, // 0xf8a7ea5 - tranfer
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: deployerUsdtJettonWallet.address,
            success: true,
            op: 395134233, // 0x178d4519 - internal_transfer
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: deployer.address,
            success: true,
            op: 1935855772 // 0x7362d09c - transfer_notification
        });
    });

    it('should setup unlock timestamp if send withdraw', async () => {
        // init all
        await deployer.send({
            to: deployerUsdtJettonWallet.address,
            value: toNano('1'),
            body: beginCell()
                .storeUint(0xf8a7ea5, 32)
                .storeUint(0, 64)
                .storeCoins(BigInt(200 * 1e6))
                .storeAddress(main.address)
                .storeAddress(deployer.address)
                .storeMaybeRef(null)
                .storeCoins(toNano('0.3'))
                .storeMaybeRef(null)
                .endCell()
        });

        const result = await deployer.send({
            to: deployerUserSc.address,
            value: toNano('0.2'),
            body: beginCell()
                .storeUint(555, 32)
                .storeUint(0n, 64)
                .endCell(),
        });
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerUserSc.address,
            success: true,
            op: 555,
        });
        let unlockTimestamp = await deployerUserSc.getUnlockTimestamp();
        expect(unlockTimestamp).toEqual(500n + 86400n); // 1 day
    });
});

