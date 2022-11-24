import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("Voting", function () {
  async function deployVotingAndTokenFixture() {
    const votingTokenSupply = 1e8;
    const maxProposalsAllowed = 3;
    const proposalTimeToLive = 19725; // 3 days

    const [owner, otherAccount, thirdAccount] = await ethers.getSigners();

    const VotingToken = await ethers.getContractFactory("VotingToken", owner);
    const votingToken = await VotingToken.deploy(votingTokenSupply);

    const Voting = await ethers.getContractFactory("Voting", owner);
    const voting = await Voting.deploy(votingToken.address);

    return { votingToken, voting, owner, otherAccount, votingTokenSupply, maxProposalsAllowed, proposalTimeToLive, thirdAccount };
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
      
      const proposalId = await voting.latestProposalId();
      expect(proposalIdFromEvent).to.equals(proposalId);
      expect(messageFromEvent).to.equals(message);
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
      
      await mineBlocks(proposalTimeToLive);
      
      const fourthProposalMessage = hashProposalMessage("4");
      await voting.propose(fourthProposalMessage);
    });

    it("propose(...) should emit ProposalDiscarded event for outdated proposal", async function () {
      const {otherAccount, voting, votingToken, votingTokenSupply, owner, proposalTimeToLive} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      const otherAccountVotes = votingTokenSupply / 2;
      await votingToken.transfer(otherAccount.address, otherAccountVotes);
      await votingToken.connect(otherAccount).delegate(otherAccount.address);

      await voting.connect(owner).propose(message);
      const firstProposalId = await voting.latestProposalId();

      await voting.connect(otherAccount).vote(firstProposalId, true);

      mineBlocks(proposalTimeToLive);

      await expect(voting.connect(owner).propose(message)).to.emit(voting, "ProposalDiscarded")
        .withArgs(firstProposalId, message, owner.address, otherAccountVotes, 0, anyValue, anyValue);
    });
  });

  describe("vote(...) function", function () {
    it("vote(..., true) should increase votes correctly", async function () {
      const {otherAccount, voting, votingToken, votingTokenSupply, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");
      
      const otherAccountVotes = votingTokenSupply / 2;
      await votingToken.transfer(otherAccount.address, otherAccountVotes);
      await votingToken.connect(otherAccount).delegate(otherAccount.address);

      await voting.connect(owner).propose(message);
      const id = await voting.latestProposalId();

      await voting.connect(otherAccount).vote(id, true);
      const {votesFor} = proposalFromTuple(await voting.getProposalById(id));
      
      expect(votesFor).to.equals(otherAccountVotes);
    });

    it("vote(..., false) should decrease votes correctly", async function () {
      const {otherAccount, voting, votingToken, votingTokenSupply, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");
      
      const otherAccountVotes = votingTokenSupply / 2;
      await votingToken.transfer(otherAccount.address, otherAccountVotes);
      await votingToken.connect(otherAccount).delegate(otherAccount.address);

      await voting.connect(owner).propose(message);
      const id = await voting.latestProposalId();

      await voting.connect(otherAccount).vote(id, false);
      const {votesAgainst} = proposalFromTuple(await voting.getProposalById(id));

      expect(votesAgainst).to.equals(otherAccountVotes);
    });

    it("Second vote from single account should be rejected", async function () {
      const {otherAccount, voting, votingToken, votingTokenSupply, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");
      
      const otherAccountVotes = votingTokenSupply / 2;
      await votingToken.transfer(otherAccount.address, otherAccountVotes);

      await voting.connect(owner).propose(message);
      const id = await voting.latestProposalId();

      await voting.connect(otherAccount).vote(id, true);
      await expect(voting.connect(otherAccount).vote(id, true)).to.be.revertedWith("Account has already voted");
    });

    it("Token transfer should not add voting power", async function() {
      const {otherAccount, voting, votingToken, votingTokenSupply, owner, thirdAccount} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");
      
      const otherAccountVotes = votingTokenSupply / 2;
      await votingToken.transfer(otherAccount.address, otherAccountVotes);
      await votingToken.connect(otherAccount).delegate(otherAccount.address);

      await voting.connect(owner).propose(message);
      const id = await voting.latestProposalId();

      await voting.connect(otherAccount).vote(id, true);
      let {votesFor} = proposalFromTuple(await voting.getProposalById(id));
      expect(votesFor).to.equals(otherAccountVotes);

      await votingToken.connect(otherAccount).transfer(thirdAccount.address, otherAccountVotes);
      await votingToken.connect(thirdAccount).delegate(thirdAccount.address);
  
      await voting.connect(thirdAccount).vote(id, true);
      let {votesFor: votesForAferThirdAccountVote} = proposalFromTuple(await voting.getProposalById(id));
      expect(votesForAferThirdAccountVote).to.equals(otherAccountVotes);

      await expect(voting.connect(otherAccount).vote(id, true)).to.be.revertedWith("Account has already voted");
    });

    it("ProposalExecuted event with success:true should be emmited when reached enough votesFor", async function () {
      const {otherAccount, voting, votingToken, votingTokenSupply, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      const otherAccountVotes = votingTokenSupply / 2;
      await votingToken.transfer(otherAccount.address, otherAccountVotes);
      await votingToken.connect(otherAccount).delegate(otherAccount.address);
      await votingToken.connect(owner).delegate(owner.address);

      await voting.connect(owner).propose(message);
      const id = await voting.latestProposalId();

      await voting.connect(owner).vote(id, true);
      await expect(voting.connect(otherAccount).vote(id, true)).to.emit(voting, "ProposalExecuted")
        .withArgs(id, message, owner.address, otherAccountVotes * 2, 0, anyValue, anyValue, otherAccount.address, true);
    });

    it("ProposalExecuted event with success:false should be emmited when reached enough votesAgainst", async function () {
      const {otherAccount, voting, votingToken, votingTokenSupply, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      const otherAccountVotes = votingTokenSupply / 2;
      await votingToken.transfer(otherAccount.address, otherAccountVotes);
      await votingToken.connect(otherAccount).delegate(otherAccount.address);
      await votingToken.connect(owner).delegate(owner.address);

      await voting.connect(owner).propose(message);
      const id = await voting.latestProposalId();

      await voting.connect(owner).vote(id, false);
      await expect(voting.connect(otherAccount).vote(id, false)).to.emit(voting, "ProposalExecuted")
        .withArgs(id, message, owner.address, 0, otherAccountVotes * 2, anyValue, anyValue, otherAccount.address, false);
    });

    it("VoteSubmitted event should be emited on successfull vote for call", async function () {
      const {voting, votingToken, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      await votingToken.connect(owner).delegate(owner.address);
      await voting.connect(owner).propose(message);
      const proposalId = await voting.latestProposalId();

      await expect(voting.connect(owner).vote(proposalId, true)).to.emit(voting, "VoteSubmitted")
        .withArgs(
          proposalId,
          owner.address,
          await votingToken.balanceOf(owner.address),
          true,
          await votingToken.balanceOf(owner.address)
        );
    });

    it("VoteSubmitted event should be emited on successfull vote against call", async function () {
      const {voting, votingToken, owner} = await loadFixture(deployVotingAndTokenFixture);
      const message = hashProposalMessage("hello world");

      await votingToken.connect(owner).delegate(owner.address);
      await voting.connect(owner).propose(message);
      const proposalId = await voting.latestProposalId();

      await expect(voting.connect(owner).vote(proposalId, false)).to.emit(voting, "VoteSubmitted")
        .withArgs(
          proposalId,
          owner.address,
          await votingToken.balanceOf(owner.address),
          false,
          await votingToken.balanceOf(owner.address)
        );
    });
  });
});

function hashProposalMessage(message: string): string {
  return ethers.utils.keccak256(ethers.utils.formatBytes32String(message));
}

function proposalFromTuple(tuple: Array<any>) {
  const [id, message, owner, votesFor, votesAgainst, voteStart, voteEnd] = tuple;
  return {id, message, owner, votesFor, votesAgainst, voteStart, voteEnd};
}

async function mineBlocks(amount: number) {
  network.provider.request({
    method: "hardhat_mine",
    params: [ `0x${amount}` ]
  })
}
