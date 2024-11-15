import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { JettonWallet } from '../wrappers/JettonWallet';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { JettonWalletGoverned } from '../wrappers/JettonWalletGoverned';
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
    update_root_price: 344,
    upgrade_contract: 999,
}

const errCodes = {
    not_parent: 544,
    not_child: 543,
    not_admin: 534,
    unknown_token: 533,
    unknown_op_code: 777,
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
    let deployerUsdtJettonWallet: SandboxContract<JettonWalletGoverned>;
    let mainUsdtJettonWallet: SandboxContract<JettonWalletGoverned>;
    let deployerBeetrootJettonWallet: SandboxContract<JettonWallet>;
    let beetrootMaster: SandboxContract<JettonMaster>;
    let deployerUserSc: SandboxContract<User>;
    let jettonWalletGovernedCode: Cell;
    let jettonWalletCode: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        // setup time 
        blockchain.now = 500;

        deployer = await blockchain.treasury('deployer');

        // jetton wallet governed
        const jettonWalletCodeGovernedRaw = await compile('JettonWalletGoverned');

        // install libs on blockchain
        const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
        _libs.set(BigInt(`0x${jettonWalletCodeGovernedRaw.hash().toString('hex')}`), jettonWalletCodeGovernedRaw);
        const libs = beginCell().storeDictDirect(_libs).endCell();
        blockchain.libs = libs;
        let lib_prep = beginCell().storeUint(2, 8).storeBuffer(jettonWalletCodeGovernedRaw.hash()).endCell();
        jettonWalletGovernedCode = new Cell({ exotic: true, bits: lib_prep.bits, refs: lib_prep.refs });

        // jetton wallet
        jettonWalletCode = await compile('JettonWallet');

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
        deployerUsdtJettonWallet = blockchain.openContract(JettonWalletGoverned.createFromConfig({
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
        mainUsdtJettonWallet = blockchain.openContract(JettonWalletGoverned.createFromConfig({
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
        deployerBeetrootJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(deployerBeetrootJettonWalletAddress));

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
                forwardPayload: null,
            }
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerBeetrootJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        let deployerUserScBeetrootJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: deployerUserSc.address,
            jettonMasterAddress: beetrootMaster.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonWallet')));
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

    it('should accept more than one deposit and withdraw', async () => {
        // first deposit
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
        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(BigInt(200 * 1e6));

        blockchain.now = 259700; // 3 days

        // second deposit
        await deployerUsdtJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.4'),
            BigInt(400 * 1e6),
            main.address,
            deployer.address,
            null,
            toNano('0.3'),
            null
        );
        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(BigInt(600 * 1e6));

        // withdraw
        const result = await deployerBeetrootJettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.4'),
                toAddress: deployerUserSc.address,
                queryId: 0,
                fwdAmount: toNano('0.35'),
                jettonAmount: toNano('2'),
                forwardPayload: null,
            }
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerBeetrootJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        let deployerUserScBeetrootJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: deployerUserSc.address,
            jettonMasterAddress: beetrootMaster.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonWallet')));
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

    it('should accept more than one deposit & more than one withdraw', async () => {
        // first deposit
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
        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(BigInt(200 * 1e6));

        blockchain.now = 259700; // 3 days

        // second deposit
        await deployerUsdtJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.4'),
            BigInt(400 * 1e6),
            main.address,
            deployer.address,
            null,
            toNano('0.3'),
            null
        );
        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(BigInt(600 * 1e6));

        let usdtBalanceBeforeWithdraw = await deployerUsdtJettonWallet.getJettonBalance();

        blockchain.now = 518900; // 6 days

        // first withdraw
        await deployerBeetrootJettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.4'),
                toAddress: deployerUserSc.address,
                queryId: 0,
                fwdAmount: toNano('0.35'),
                jettonAmount: toNano('2'),
                forwardPayload: null,
            }
        );

        let usdtBalanceAfterWithdraw = await deployerUsdtJettonWallet.getJettonBalance();

        expect(usdtBalanceAfterWithdraw - usdtBalanceBeforeWithdraw).toBeGreaterThan(BigInt(200 * 1e6));
        expect(usdtBalanceAfterWithdraw - usdtBalanceBeforeWithdraw).toBeLessThan(BigInt(200.3 * 1e6));

        expect((await deployerBeetrootJettonWallet.getWalletData()).balance).toEqual(toNano('4'));

        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(BigInt(400 * 1e6));

        blockchain.now = 778100; // 9 days

        // second withdraw
        await deployerBeetrootJettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.4'),
                toAddress: deployerUserSc.address,
                queryId: 0,
                fwdAmount: toNano('0.35'),
                jettonAmount: toNano('4'),
                forwardPayload: null,
            }
        );

        let usdtBalanceAfterSecondWithdraw = await deployerUsdtJettonWallet.getJettonBalance();

        expect(usdtBalanceAfterSecondWithdraw - usdtBalanceAfterWithdraw).toBeGreaterThan(BigInt(400.1 * 1e6));
        expect(usdtBalanceAfterSecondWithdraw - usdtBalanceAfterWithdraw).toBeLessThan(BigInt(400.4 * 1e6));

        expect((await deployerBeetrootJettonWallet.getWalletData()).balance).toEqual(toNano('0'));

        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(0n);
    });

    it('should upgrade contract', async () => {
        let oldData = await main.getData();

        let newCodeCell = Cell.fromHex("b5ee9c7241020d01000323000114ff00f4a413f4bcf2c80b01020162020903f8d03331d0d3030171b0915be021d749c120915be0fa403001d31fd33fdb3c2982107362d09cba8ed439f828506270546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d05188c705f2e21504fa00fa403020d70b01c000925f09e07053075140541640528a0c030501e0f8285970c8cb1f5004cf1658cf1601cf16cc70fa0270fa0270fa02c976c8cb0412ccccc920f9007074c8cb02ca07cbffc9d0f8238014c8cb1f17cb3f16cb1f5004fa0258fa0201fa02c9778010c8cb055004cf168209c9c380fa0213cb6bccccc970fb005005a9048103e8a8230350250401cc708210178d4519c8cb1f5250cb3f5004fa02f828cf1622cf1682080f4240fa0213cb00c98015c8cb1f14cb3f01cf168209312d00fa0212ccc9d0708018c8cb055003cf168209c9c380fa0212cb6a01cf16c970fb0082080f4240c8c9541404820afaf080db3c0801c6e02981022cbae3023037278103e7ba8e13145f046c2212c705f2e216d4d4d101ed54fb04e027810158ba8e27375177c705f2e21603d33fd1465010344130c85007cf165005cf1613cc01cf16cccccb3fc9ed54e0165f0632c00193fe2030e030f2c3090601fe333805fa40d31ffa00fa0031fa0031d1f82823104603417b70c8cb1f5004cf1658cf1601cf16cc70fa0270fa0270fa02c976c8cb0412ccccc9f9007074c8cb02ca07cbffc9d018c705f2e21ff828403470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d005070148a70ff8235005a114a8812710a88209e13380a904a0c8c91482080f4240820afaf080db3c08008c7082100f8a7ea5c8cb1f16cb3f5007fa025005cf16f828cf1613cb005003fa0221d0c700947032cb00957101cb00cce2c9718018c8cb055003cf165003fa02cb6accc970fb000201580a0b0109b86a0db3c80c0177ba353db3c135f0333f82840040370c8cb1f5004cf1658cf1601cf16cc70fa0270fa0270fa02c976c8cb0412ccccc9f9007074c8cb02ca07cbffc9d080c001eed44d0fa40fa40d4fa40d4d4d33f3099ad32fe")
        let newDataCell = beginCell()
            .storeAddress(usdtMaster.address)
            .storeAddress(beetrootMaster.address)
            .storeRef(await compile('User'))
            .storeAddress(deployer.address)
            .storeRef(jettonWalletGovernedCode)
            .storeRef(jettonWalletCode)
            .storeUint(101, 64)
            .endCell();

        const checkNewCodeLogicOnOldMain = await deployer.send({
            to: main.address,
            value: toNano('0.5'),
            body: beginCell().storeUint(1, 32).storeUint(0, 64).endCell(),
        });
        expect(checkNewCodeLogicOnOldMain.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            success: false,
            exitCode: errCodes.unknown_op_code,
        });

        const result = await main.sendUpgradeContract(
            deployer.getSender(),
            toNano('0.5'),
            0n,
            newCodeCell,
            newDataCell,
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            success: true,
            op: opCodes.upgrade_contract,
        });

        const checkNewCodeLogicOnNewMain = await deployer.send({
            to: main.address,
            value: toNano('0.5'),
            body: beginCell().storeUint(1, 32).storeUint(0, 64).endCell(),
        });

        expect(checkNewCodeLogicOnNewMain.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            success: true,
            op: 1,
        });

        let newData = await main.getData();

        expect(newData.rootPrice - oldData.rootPrice).toEqual(1n);
        expect(oldData.adminAddress).toEqualAddress(newData.adminAddress);
        expect(oldData.usdtJettonMasterAddress).toEqualAddress(newData.usdtJettonMasterAddress);
        expect(oldData.rootMasterAddress).toEqualAddress(newData.rootMasterAddress);
        expect(oldData.jettonWalletCode).toEqualCell(newData.jettonWalletCode);
        expect(oldData.usdtJettonWalletCode).toEqualCell(newData.usdtJettonWalletCode);
        expect(oldData.userScCode).toEqualCell(newData.userScCode);
    });

    it('should update root price', async () => {
        let rootPriceBefore = (await main.getData()).rootPrice;

        const result = await main.sendUpdateRootPrice(
            deployer.getSender(),
            toNano('0.02'),
            0n,
            101n,
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            success: true,
            op: opCodes.update_root_price,
        });

        let rootPriceAfter = (await main.getData()).rootPrice;
        expect(rootPriceAfter - rootPriceBefore).toEqual(1n);
    });

    it('should accept one deposit & more than one withdraw', async () => {
        await deployerUsdtJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.4'),
            BigInt(600 * 1e6),
            main.address,
            deployer.address,
            null,
            toNano('0.3'),
            null
        );
        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(BigInt(600 * 1e6));

        blockchain.now = 259700; // 3 days

        let usdtBalanceBeforeWithdraw = await deployerUsdtJettonWallet.getJettonBalance();

        // first withdraw
        await deployerBeetrootJettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.4'),
                toAddress: deployerUserSc.address,
                queryId: 0,
                fwdAmount: toNano('0.35'),
                jettonAmount: toNano('2'),
                forwardPayload: null,
            }
        );

        let usdtBalanceAfterWithdraw = await deployerUsdtJettonWallet.getJettonBalance();

        expect(usdtBalanceAfterWithdraw - usdtBalanceBeforeWithdraw).toBeGreaterThan(BigInt(200 * 1e6));
        expect(usdtBalanceAfterWithdraw - usdtBalanceBeforeWithdraw).toBeLessThan(BigInt(200.2 * 1e6));

        expect((await deployerBeetrootJettonWallet.getWalletData()).balance).toEqual(toNano('4'));

        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(BigInt(400 * 1e6));

        blockchain.now = 778100; // 9 days

        // second withdraw
        await deployerBeetrootJettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.4'),
                toAddress: deployerUserSc.address,
                queryId: 0,
                fwdAmount: toNano('0.35'),
                jettonAmount: toNano('4'),
                forwardPayload: null,
            }
        );

        let usdtBalanceAfterSecondWithdraw = await deployerUsdtJettonWallet.getJettonBalance();

        expect(usdtBalanceAfterSecondWithdraw - usdtBalanceAfterWithdraw).toBeGreaterThan(BigInt(400.3 * 1e6));
        expect(usdtBalanceAfterSecondWithdraw - usdtBalanceAfterWithdraw).toBeLessThan(BigInt(400.4 * 1e6));

        expect((await deployerBeetrootJettonWallet.getWalletData()).balance).toEqual(toNano('0'));

        expect((await deployerUserSc.getUserData()).totalDepositAmount).toEqual(0n);
    });

    it('should not accept if transfer not usdt to main', async () => {
        // create some jetton
        const jetton = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: toNano('9999'),
            adminAddress: deployer.address,
            content: beginCell()
                .storeUint(0x01, 8)
                .storeStringTail('https://raw.githubusercontent.com/welaskez/test-jetton-metadata/refs/heads/main/metadata.json')
                .endCell(),
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonMaster')));

        // deployer jetton jetton walet
        let deployerJettonJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: deployer.address,
            jettonMasterAddress: jetton.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonWallet')));

        // mint jetton for deployer
        const mintJettonForDeployerResult = await jetton.sendMint(
            deployer.getSender(),
            toNano('0.2'),
            {
                queryId: 0n,
                toAddress: deployer.address,
                jettonAmount: toNano('100'),
            }
        )
        expect(mintJettonForDeployerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jetton.address,
            success: true,
            op: opCodes.mint,
        });
        expect(mintJettonForDeployerResult.transactions).toHaveTransaction({
            from: jetton.address,
            to: deployerJettonJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(mintJettonForDeployerResult.transactions).toHaveTransaction({
            from: deployerJettonJettonWallet.address,
            to: deployer.address,
            success: true,
            op: opCodes.transfer_notification,
        });

        let mainJettonJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: main.address,
            jettonMasterAddress: jetton.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonWallet')));

        const result = await deployerJettonJettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.4'),
                toAddress: main.address,
                queryId: 0,
                fwdAmount: toNano('0.3'),
                jettonAmount: toNano('100'),
                forwardPayload: null,
            }
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonJettonWallet.address,
            success: true,
            op: opCodes.transfer
        });
        expect(result.transactions).toHaveTransaction({
            from: deployerJettonJettonWallet.address,
            to: mainJettonJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainJettonJettonWallet.address,
            to: main.address,
            success: false,
            exitCode: errCodes.unknown_token,
            op: opCodes.transfer_notification,
        });
    });

    it('should not accept if not child send withdraw_internal to main', async () => {
        let user = await blockchain.treasury('user');

        const result = await user.send({
            to: main.address,
            value: toNano('0.5'),
            body: beginCell()
                .storeUint(opCodes.withdraw_internal, 32)
                .storeUint(0, 64)
                .storeAddress(user.address)
                .storeUint(0, 32)
                .storeCoins(0)
                .storeCoins(0)
                .storeCoins(0)
                .endCell(),
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: false,
            exitCode: errCodes.not_child,
        });
    });

    it('should not update root price & upgrade contract if not admin', async () => {
        let user = await blockchain.treasury('user');

        const updateRootPriceResult = await main.sendUpdateRootPrice(
            user.getSender(),
            toNano('0.05'),
            0n,
            101n
        );

        const upgradeContractResult = await main.sendUpgradeContract(
            user.getSender(),
            toNano('0.05'),
            0n,
            Cell.EMPTY,
            Cell.EMPTY,
        );

        expect(updateRootPriceResult.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: false,
            exitCode: errCodes.not_admin,
        });

        expect(upgradeContractResult.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: false,
            exitCode: errCodes.not_admin,
        });
    });

    it('should not deposit if not main', async () => {
        let user = await blockchain.treasury('user');

        let userUsdtJettonWallet = blockchain.openContract(JettonWalletGoverned.createFromAddress(await usdtMaster.getWalletAddress(user.address)));

        const mintUsdtForUserResult = await usdtMaster.sendMint(
            deployer.getSender(),
            user.address,
            BigInt(200 * 1e6),
            null,
            null,
            null,
            toNano('0.3'),
            toNano('1.5'),
        );
        expect(mintUsdtForUserResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtMaster.address,
            success: true,
            op: opCodes.mint_usdt,
        });
        expect(mintUsdtForUserResult.transactions).toHaveTransaction({
            from: usdtMaster.address,
            to: userUsdtJettonWallet.address,
            success: true,
            deploy: true,
            op: opCodes.internal_transfer,
        });

        let userUserSc = blockchain.openContract(User.createFromConfig({
            adminAddress: user.address,
            mainScAddress: main.address,
            rootMasterAddress: beetrootMaster.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('User')));

        const userDepositResult = await userUsdtJettonWallet.sendTransfer(
            user.getSender(),
            toNano('0.4'),
            BigInt(200 * 1e6),
            main.address,
            user.address,
            null,
            toNano('0.3'),
            null,
        );
        expect(userDepositResult.transactions).toHaveTransaction({
            from: main.address,
            to: userUserSc.address,
            success: true,
            deploy: true,
            op: opCodes.deposit,
        });

        const secondDepositResult = await user.send({
            to: userUserSc.address,
            value: toNano('0.5'),
            body: beginCell()
                .storeUint(opCodes.deposit, 32)
                .storeUint(0, 64)
                .storeUint(0, 32)
                .storeCoins(0)
                .storeCoins(0)
                .storeCoins(0)
                .endCell(),
        });
        expect(secondDepositResult.transactions).toHaveTransaction({
            from: user.address,
            to: userUserSc.address,
            success: false,
            exitCode: errCodes.not_parent,
        });
    });

    it('should not accept withdraw if transfered token not beetroot', async () => {
        let user = await blockchain.treasury('user');

        // mint some jetton
        const jetton = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: toNano('9999'),
            adminAddress: deployer.address,
            content: beginCell()
                .storeUint(0x01, 8)
                .storeStringTail('https://raw.githubusercontent.com/welaskez/test-jetton-metadata/refs/heads/main/metadata.json')
                .endCell(),
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonMaster')));

        let userJettonJettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
            ownerAddress: user.address,
            jettonMasterAddress: jetton.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonWallet')));

        const mintJettonForUserResult = await jetton.sendMint(
            deployer.getSender(),
            toNano('0.5'),
            {
                queryId: 0n,
                toAddress: user.address,
                jettonAmount: toNano("200"),
            },
        );
        expect(mintJettonForUserResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jetton.address,
            success: true,
            op: opCodes.mint,
        });
        expect(mintJettonForUserResult.transactions).toHaveTransaction({
            from: jetton.address,
            to: userJettonJettonWallet.address,
            success: true,
            deploy: true,
            op: opCodes.internal_transfer,
        });

        let userUserSc = blockchain.openContract(User.createFromConfig({
            adminAddress: user.address,
            rootMasterAddress: beetrootMaster.address,
            mainScAddress: main.address,
            jettonWalletCode: jettonWalletCode,
        }, await compile('User')));

        const withdrawResult = await user.send({
            to: userUserSc.address,
            value: toNano('5'),
            body: beginCell()
                .storeUint(opCodes.deposit, 32)
                .storeUint(0, 64)
                .storeUint(0, 32)
                .storeCoins(0)
                .storeCoins(0)
                .storeCoins(0)
                .endCell(),
        });

    });

    it('should throw error if unknown op code', async () => {
        const result = await deployer.send({
            to: main.address,
            value: toNano('0.05'),
            body: beginCell().storeUint(3, 32).storeUint(0, 64).endCell()
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            success: false,
            exitCode: errCodes.unknown_op_code,
        });
    });
});
