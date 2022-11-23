import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, network } from "hardhat";

function hashProposalMessage(message: string): string {
  return ethers.utils.keccak256(ethers.utils.formatBytes32String(message));
}

describe("Voting", function () {

  async function deployVotingAndTokenFixture() {
    const votingTokenSupply = 1e8;
    const maxProposalsAllowed = 3;
    const proposalTimeToLive = 19725; // 3 days

    const [owner, otherAccount] = await ethers.getSigners();

    const VotingToken = await ethers.getContractFactory("VotingToken", owner);
    const votingToken = await VotingToken.deploy(votingTokenSupply);

    const Voting = await ethers.getContractFactory("Voting", owner);
    const voting = await Voting.deploy(votingToken.address);

    return { votingToken, voting, owner, otherAccount, votingTokenSupply, maxProposalsAllowed, proposalTimeToLive };
  }

  describe("Deployment", function () {
    it("VotingToken should have correct supply and decimals", async function () {
      const {votingToken, votingTokenSupply} = await loadFixture(deployVotingAndTokenFixture);
      
      expect(await votingToken.totalSupply()).to.equal(votingTokenSupply);
      expect(await votingToken.decimals()).to.equal(6);
    });

    it("Voting should set correct token address, maxProposalsAllowed and proposalTimeToLive", async function() {
      const {votingToken, voting, maxProposalsAllowed, proposalTimeToLive} = await loadFixture(deployVotingAndTokenFixture);

      expect(await voting.token()).to.equals(votingToken.address);
      expect(await voting.MaxProposalsAllowed()).to.equals(maxProposalsAllowed);
      expect(await voting.ProposalTimeToLive()).to.equals(proposalTimeToLive);
    });
  });

  describe("propose(...)", function () {
    it("propose(...) should emit ProposalCreated event", async function () {
      const {voting, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      await expect(voting.propose(message)).to.emit(voting, "ProposalCreated")
    });

    it("propose(...) should emit event with correct args", async function () {
      const {voting, owner, proposalTimeToLive} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      const tx = await voting.propose(message);
      const res = await tx.wait();
      const eventArgs = res.events![0].args!;
      const proposalIdFromEvent = eventArgs[0];
      const messageFromEvent = eventArgs[1];
      const ownerFromEvent = eventArgs[2];
      const voteStart = eventArgs[3];
      const voteEnd = eventArgs[4];

      expect(message).to.equals(messageFromEvent);
      expect(ownerFromEvent).to.equals(owner.address);
      expect(voteEnd - voteStart).to.equals(proposalTimeToLive);
    });

    it("Proposal from contract should be equal proposal from ProposalCreated event", async function () {
      const {voting} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");
      
      const tx = await voting.propose(message);
      const res = await tx.wait();
      const eventArgs = res.events![0].args!;

      const proposalIdFromEvent = eventArgs[0];
      const messageFromEvent = eventArgs[1];
      const ownerFromEvent = eventArgs[2];
      const voteStart = eventArgs[3];
      const voteEnd = eventArgs[4];

      const proposal = await voting.proposals(proposalIdFromEvent);
      
      expect(proposal.message).to.equals(messageFromEvent);
      expect(proposal.id).to.equals(proposalIdFromEvent);
      expect(proposal.owner).to.equals(ownerFromEvent);
      expect(proposal.voteStart).to.equals(voteStart);
      expect(proposal.voteEnd).to.equals(voteEnd);
    });

    it("Active proposals with equal messages are forbidden", async function() {
      const {voting} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      await voting.propose(message);
      await expect(voting.propose(message)).to.be.revertedWith("Proposal already exists");
    });

    it("Maximum 3 active proposals should be allowed at a time", async function() {
      const {voting} = await loadFixture(deployVotingAndTokenFixture);
      const messages = ["1", "2", "3"].map(hashProposalMessage);
      await Promise.all(messages.map(message => voting.propose(message)));

      const fourthProposalMessage = hashProposalMessage("4");
      await expect(voting.propose(fourthProposalMessage)).to.be.revertedWith("Max amount of proposals is already reached");
    });

    it("Oldest outdated proposal should be removed on propose(...) call", async function () {
      const {voting, proposalTimeToLive} = await loadFixture(deployVotingAndTokenFixture);
      const messages = ["1", "2", "3"].map(hashProposalMessage);
      await Promise.all(messages.map(message => voting.propose(message)));
      
      await network.provider.request({
        method: "hardhat_mine",
        params: [ `0x${proposalTimeToLive}` ]
      })
      
      const fourthProposalMessage = hashProposalMessage("4");
      await voting.propose(fourthProposalMessage);
    });
  });
});
