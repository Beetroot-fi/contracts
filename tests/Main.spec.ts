import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { JettonWalletCommon } from '../wrappers/JettonWalletCommon';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonMinter } from "../wrappers/Stablecoin"
import { compile } from '@ton/blueprint';
import { Main } from '../wrappers/Main';
import { User } from '../wrappers/User';
import '@ton/test-utils';

const opCodes = {
    transfer: 260734629,
    transfer_notification: 1935855772,
    internal_transfer: 395134233,
    mint_usdt: 1680571655,
    mint: 21,
    change_admin: 3,
    deposit: 20,
    burn: 1499400124,
    burn_notification: 2078119902,
    withdraw_internal: 556,
}

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
    let jettonWalletCode: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        // setup time 
        blockchain.now = 500;

        deployer = await blockchain.treasury('deployer');

        // jetton wallet governed
        const jettonWalletCodeGovernedRaw = await compile('JettonWallet');

        // install libs on blockchain
        const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
        _libs.set(BigInt(`0x${jettonWalletCodeGovernedRaw.hash().toString('hex')}`), jettonWalletCodeGovernedRaw);
        const libs = beginCell().storeDictDirect(_libs).endCell();
        blockchain.libs = libs;
        let lib_prep = beginCell().storeUint(2, 8).storeBuffer(jettonWalletCodeGovernedRaw.hash()).endCell();
        const jettonWalletGovernedCode = new Cell({ exotic: true, bits: lib_prep.bits, refs: lib_prep.refs });

        // jetton wallet
        jettonWalletCode = await compile('JettonWalletCommon');

        // deploy usdt master
        usdtMaster = blockchain.openContract(JettonMinter.createFromConfig({
            admin: deployer.address,
            wallet_code: jettonWalletGovernedCode,
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
        const mintUsdtForDepolyerResult = await usdtMaster.sendMint(
            deployer.getSender(),
            deployer.address,
            toNano('3000'),
        );
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtMaster.address,
            success: true,
            op: opCodes.mint_usdt,
        });
        deployerUsdtJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: deployer.address,
            jettonMasterAddress: usdtMaster.address,
        }, jettonWalletGovernedCode));
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
            op: opCodes.transfer_notification,
        });

        // deploy beetroot master
        beetrootMaster = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: toNano('1000000000'),
            adminAddress: deployer.address,
            content: beginCell()
                .storeUint(0x01, 8)
                .storeStringTail('https://raw.githubusercontent.com/welaskez/test-jetton-metadata/refs/heads/main/metadata.json')
                .endCell(),
            jettonWalletCode: jettonWalletCode,
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
            rootMasterAddress: beetrootMaster.address,
            userScCode: await compile('User'),
            adminAddress: deployer.address,
            jettonWalletGovernedCode: jettonWalletGovernedCode,
            jettonWalletCode: jettonWalletCode,
            rootPrice: 100n,
        }, code));

        const deployResult = await main.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            deploy: true,
            success: true,
        });

        // change beetroot jetton master owner to main sc
        const changeOwnerResult = await beetrootMaster.sendChangeAdmin(
            deployer.getSender(),
            toNano('0.3'),
            {
                queryId: 0n,
                newAdminAddress: main.address,
            }
        );
        expect(changeOwnerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: beetrootMaster.address,
            success: true,
            op: opCodes.change_admin,
        });
        let beetrootMasterData = await beetrootMaster.getJettonData();
        expect(beetrootMasterData.adminAddress).toEqualAddress(main.address);

        // getting main usdt jetton wallet
        mainUsdtJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: main.address,
            jettonMasterAddress: usdtMaster.address,
        }, jettonWalletGovernedCode));

        // mint usdt for main sc
        const mintUsdtForMainResult = await usdtMaster.sendMint(
            deployer.getSender(),
            main.address,
            toNano('3000'),
            null,
            null,
            null,
            toNano('0.3'),
            toNano('1.5')
        );

        expect(mintUsdtForMainResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtMaster.address,
            success: true,
            op: opCodes.mint_usdt,
        });
        expect(mintUsdtForMainResult.transactions).toHaveTransaction({
            from: usdtMaster.address,
            to: mainUsdtJettonWallet.address,
            deploy: true,
            success: true,
        });
        expect(mintUsdtForMainResult.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: main.address,
            success: true,
            op: opCodes.transfer_notification,
        });

        // getting main beetroot jetton wallet
        let deployerBeetrootJettonWalletAddress = await beetrootMaster.getWalletAddress(deployer.address);
        deployerBeetrootJettonWallet = blockchain.openContract(JettonWalletCommon.createFromAddress(deployerBeetrootJettonWalletAddress));

        // getting deployer user sc
        deployerUserSc = blockchain.openContract(User.createFromConfig({
            adminAddress: deployer.address,
            mainScAddress: main.address,
            rootMasterAddress: beetrootMaster.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('User')));
    });

    it('should deploy user sc, mint beetroot & send reward for admins if receive usdt', async () => {
        const result = await deployerUsdtJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.4'),
            BigInt(200 * 1e6),
            main.address,
            deployer.address,
            null,
            toNano('0.3'),
            null
        );

        // check trasnfer usdt
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: main.address,
            success: true,
            op: opCodes.transfer_notification,
        });

        // check deploy user sc
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: deployerUserSc.address,
            success: true,
            deploy: true,
            op: opCodes.deposit,
        });
        let userScData = await deployerUserSc.getUserData();
        expect(userScData.depositTimestamp).toEqual(500n);
        expect(userScData.adminAddress).toEqualAddress(deployer.address);
        expect(userScData.mainScAddress).toEqualAddress(main.address);
        expect(userScData.rootMasterAddress).toEqualAddress(beetrootMaster.address);
        expect(userScData.jettonWalletCode).toEqualCell(jettonWalletCode);
        expect(userScData.usdtSlpAmount).toEqual(0n);
        expect(userScData.usdtTlpAmount).toEqual(0n);
        expect(userScData.totalDepositAmount).toEqual(BigInt(200 * 1e6));

        // check mint beetroot
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: beetrootMaster.address,
            success: true,
            op: opCodes.mint,
        });
        expect(result.transactions).toHaveTransaction({
            from: beetrootMaster.address,
            to: deployerBeetrootJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        let deployerBeetrootJettonWalletData = await deployerBeetrootJettonWallet.getWalletData();
        expect(deployerBeetrootJettonWalletData.balance).toEqual(toNano('2'));

        // check sending profit to admins
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: deployerUsdtJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: deployer.address,
            success: true,
            op: opCodes.transfer_notification,
        });
    });

    it('should withdraw', async () => {
        // init
        await deployerUsdtJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.4'),
            BigInt(200 * 1e6),
            main.address,
            deployer.address,
            null,
            toNano('0.3'),
            null
        );

        blockchain.now = 259700; // 3 days

        // check sending root to deployer user sc
        const result = await deployerBeetrootJettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.4'),
                toAddress: deployerUserSc.address,
                queryId: 0,
                fwdAmount: toNano('0.35'),
                jettonAmount: toNano('2'),
            }
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerBeetrootJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        let deployerUserScBeetrootJettonWallet = blockchain.openContract(JettonWalletCommon.createFromConfig({
            ownerAddress: deployerUserSc.address,
            jettonMasterAddress: beetrootMaster.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonWalletCommon')));
        expect(result.transactions).toHaveTransaction({
            from: deployerBeetrootJettonWallet.address,
            to: deployerUserScBeetrootJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerUserScBeetrootJettonWallet.address,
            to: deployerUserSc.address,
            success: true,
            op: opCodes.transfer_notification,
        });

        // check burn root
        expect(result.transactions).toHaveTransaction({
            from: deployerUserSc.address,
            to: deployerUserScBeetrootJettonWallet.address,
            success: true,
            op: opCodes.burn,
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerUserScBeetrootJettonWallet.address,
            to: beetrootMaster.address,
            success: true,
            op: opCodes.burn_notification,
        });
        expect((await deployerUserScBeetrootJettonWallet.getWalletData()).balance).toEqual(0n);

        // check getting yield
        expect(result.transactions).toHaveTransaction({
            from: deployerUserSc.address,
            to: main.address,
            success: true,
            op: opCodes.withdraw_internal,
        });

        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: deployerUsdtJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: deployer.address,
            success: true,
            op: opCodes.transfer_notification,
        });
    });
});

