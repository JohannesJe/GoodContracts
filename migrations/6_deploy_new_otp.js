const settings = require("./deploy-settings.json");

const Identity = artifacts.require("./Identity");
const Avatar = artifacts.require("./Avatar.sol");
const AbsoluteVote = artifacts.require("./AbsoluteVote.sol");
const SchemeRegistrar = artifacts.require("./SchemeRegistrar.sol");
const OneTimePayments = artifacts.require("./OneTimePayments.sol");

const getFounders = require("./getFounders");
const releaser = require("../scripts/releaser.js");
const fse = require("fs-extra");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const NULL_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

module.exports = async function (deployer, network, accounts) {
  if (network.indexOf("mainnet") >= 0) {
    console.log("Skipping OTPL for mainnet");
    return;
  }
  const networkSettings = { ...settings["default"], ...settings[network] };

  const file = await fse.readFile("releases/deployment.json", "utf8");
  const previousDeployment = await JSON.parse(file);
  const networkAddresses = previousDeployment[network];

  const avataraddr = await networkAddresses.Avatar;
  const voteaddr = await networkAddresses.AbsoluteVote;
  const schemeaddr = await networkAddresses.SchemeRegistrar;
  const identityaddr = await networkAddresses.Identity;

  const founders = await getFounders(AbsoluteVote.web3, network);
  console.log({ founders });
  const avatar = await Avatar.at(avataraddr);
  const identity = await Identity.at(identityaddr);
  const absoluteVote = await AbsoluteVote.at(voteaddr);
  const schemeRegistrar = await SchemeRegistrar.at(schemeaddr);

  const oneTimePayments = await deployer.deploy(
    OneTimePayments,
    avatar.address,
    identity.address
  );

  console.log("proposing otp scheme");
  let transaction = await schemeRegistrar.proposeScheme(
    avatar.address,
    oneTimePayments.address,
    NULL_HASH,
    "0x00000010",
    NULL_HASH
  );

  let proposalId = transaction.logs[0].args._proposalId;
  console.log("voting otp scheme");
  const voteResults = await Promise.all(
    founders
      .slice(0, Math.ceil(founders.length / 2))
      .map(f => absoluteVote.vote(proposalId, 1, 0, f, { from: f, gas: 500000 }))
  );
  console.log("starting otp scheme");

  await oneTimePayments.start();

  let releasedContracts = {
    ...networkAddresses,
    OneTimePayments: await oneTimePayments.address
  };

  console.log("Rewriting deployment file...\n", { releasedContracts });
  await releaser(releasedContracts, network);
};
