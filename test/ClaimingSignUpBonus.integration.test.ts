import * as helpers from "./helpers";

const Identity = artifacts.require("Identity");
const DaoCreatorGoodDollar = artifacts.require("DaoCreatorGoodDollar");
const Avatar = artifacts.require("Avatar");
const GoodDollar = artifacts.require("GoodDollar");
const ControllerInterface = artifacts.require("ControllerInterface");
const AbsoluteVote = artifacts.require("AbsoluteVote");
const SchemeRegistrar = artifacts.require("SchemeRegistrar");
const SignUpBonus = artifacts.require("SignUpBonus");

contract(
  "Integration - rewarding whitelisted bonus",
  ([founder, whitelisted, whitelisted2, nonWhitelisted]) => {
    let identity: helpers.ThenArg<ReturnType<typeof Identity["new"]>>;
    let avatar: helpers.ThenArg<ReturnType<typeof Avatar["new"]>>;
    let controller: helpers.ThenArg<ReturnType<typeof ControllerInterface["new"]>>;
    let absoluteVote: helpers.ThenArg<ReturnType<typeof AbsoluteVote["new"]>>;
    let token: helpers.ThenArg<ReturnType<typeof GoodDollar["new"]>>;
    let signUpBonus: helpers.ThenArg<ReturnType<typeof SignUpBonus["new"]>>;
    let emptySignUp: helpers.ThenArg<ReturnType<typeof SignUpBonus["new"]>>;
    let demandingSignUp: helpers.ThenArg<ReturnType<typeof SignUpBonus["new"]>>;

    let proposalId: string;

    before(async () => {
      identity = await Identity.deployed();
      avatar = await Avatar.at(await (await DaoCreatorGoodDollar.deployed()).avatar());
      controller = await ControllerInterface.at(await avatar.owner());
      absoluteVote = await AbsoluteVote.deployed();
      token = await GoodDollar.at(await avatar.nativeToken());
      signUpBonus = await SignUpBonus.new(
        avatar.address,
        identity.address,
        helpers.toGD("100"),
        6
      );
      emptySignUp = await SignUpBonus.new(avatar.address, identity.address, 0, 5);
      demandingSignUp = await SignUpBonus.new(
        avatar.address,
        identity.address,
        web3.utils.toWei("100000"),
        5
      );

      await identity.addWhitelisted(signUpBonus.address);
      await identity.addWhitelisted(whitelisted);
      await identity.addWhitelisted(whitelisted2);
    });

    it("should not allow signup with zero max bonus", async () => {
      await helpers.assertVMException(
        SignUpBonus.new(avatar.address, identity.address, 0, 0),
        "Max bonus cannot be zero"
      );
    });

    it("should not allow awarding before starting scheme", async () => {
      await helpers.assertVMException(
        signUpBonus.awardUser(whitelisted, 3),
        "is not active"
      );
    });

    it("should start SignUpBonus scheme", async () => {
      const schemeRegistrar = await SchemeRegistrar.deployed();
      const transaction = await schemeRegistrar.proposeScheme(
        avatar.address,
        signUpBonus.address,
        helpers.NULL_HASH,
        "0x0000010",
        helpers.NULL_HASH
      );

      proposalId = transaction.logs[0].args._proposalId;

      const voteResult = await absoluteVote.vote(proposalId, 1, 0, founder);
      const executeProposalEventExists = voteResult.logs.some(
        e => e.event === "ExecuteProposal"
      );

      // Verifies that the ExecuteProposal event has been emitted
      assert(executeProposalEventExists);

      // await token.transfer(avatar.address, helpers.toGD("500"));
      assert(await signUpBonus.start());
    });

    it("should not allow awarding by non admin", async () => {
      await helpers.assertVMException(
        signUpBonus.awardUser(nonWhitelisted, 5, { from: nonWhitelisted }),
        "not IdentityAdmin"
      );
    });

    it("should allow awarding", async () => {
      let oldBalance = await token.balanceOf(whitelisted);
      expect(oldBalance.toString()).to.be.equal("0");

      await signUpBonus.awardUser(whitelisted, 5);

      let newBalance = await token.balanceOf(whitelisted);
      expect(newBalance.toString()).to.be.equal("5");
    });

    it("should not allow awarding more than max bonus", async () => {
      await helpers.assertVMException(
        signUpBonus.awardUser(whitelisted, 2),
        "Cannot award user beyond max"
      );
    });

    it("should end SignUpBonus scheme", async () => {
      await signUpBonus.end();
    });

    it("should unregister SignUpBonus scheme", async () => {
      const schemeRegistrar = await SchemeRegistrar.deployed();
      const transaction = await schemeRegistrar.proposeToRemoveScheme(
        avatar.address,
        signUpBonus.address,
        helpers.NULL_HASH
      );

      proposalId = transaction.logs[0].args._proposalId;

      const voteResult = await await absoluteVote.vote(proposalId, 1, 0, founder);
      const executeProposalEventExists = voteResult.logs.some(
        e => e.event === "ExecuteProposal"
      );

      assert(executeProposalEventExists);
    });

    it("should start empty SignUpBonus scheme", async () => {
      const schemeRegistrar = await SchemeRegistrar.deployed();
      const transaction = await schemeRegistrar.proposeScheme(
        avatar.address,
        emptySignUp.address,
        helpers.NULL_HASH,
        "0x0000010",
        helpers.NULL_HASH
      );

      proposalId = transaction.logs[0].args._proposalId;

      const voteResult = await absoluteVote.vote(proposalId, 1, 0, founder);
      const executeProposalEventExists = voteResult.logs.some(
        e => e.event === "ExecuteProposal"
      );

      // Verifies that the ExecuteProposal event has been emitted
      assert(executeProposalEventExists);
      assert(await emptySignUp.start());
    });

    it("should not start empty SignUpBonus scheme", async () => {
      const schemeRegistrar = await SchemeRegistrar.deployed();
      const transaction = await schemeRegistrar.proposeScheme(
        avatar.address,
        demandingSignUp.address,
        helpers.NULL_HASH,
        "0x0000010",
        helpers.NULL_HASH
      );

      proposalId = transaction.logs[0].args._proposalId;

      const voteResult = await absoluteVote.vote(proposalId, 1, 0, founder);
      const executeProposalEventExists = voteResult.logs.some(
        e => e.event === "ExecuteProposal"
      );

      // Verifies that the ExecuteProposal event has been emitted
      assert(executeProposalEventExists);
      await helpers.assertVMException(
        demandingSignUp.start(),
        "Not enough funds to start"
      );
    });

    it("should end empty SignUpBonus scheme", async () => {
      await emptySignUp.end();
    });
  }
);

export {};
