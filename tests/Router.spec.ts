import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Router } from '../wrappers/Router';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Router', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Router');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let router: SandboxContract<Router>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        router = blockchain.openContract(Router.createFromConfig({
            mainScAddress: deployer.address,
            usdtJettonMasterAddress: deployer.address,
            tradoorMasterAddress: deployer.address,
            evaaMasterAddress: deployer.address,
            stormVaultAddress: deployer.address,
            usdtTlpMasterAddress: deployer.address,
            usdtSlpMasterAddress: deployer.address,
            jettonWalletCode: await compile('JettonWallet'),
            jettonWalletGovernedCode: await compile('JettonWalletGoverned'),
        }, code));

        const deployResult = await router.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: router.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and tradoorRouter are ready to use
    });
});
