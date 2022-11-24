// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/governance/utils/IVotes.sol";

import "hardhat/console.sol";

contract Voting {
  event ProposalCreated(
    uint256 id,
    bytes32 message,
    address owner,
    uint256 voteStart,
    uint256 voteEnd
  );

  event VoteSubmitted(
    uint256 proposalId,
    address submitter,
    uint256 votingPower,
    bool isFor,
    uint256 newVotesAmount
  );

  event ProposalExecuted(
    uint256 id,
    bytes32 message,
    address owner,
    uint256 votesFor,
    uint256 votesAgainst,
    uint256 voteStart,
    uint256 voteEnd,
    address executor,
    bool success
  );

  event ProposalDiscarded(
    uint256 id,
    bytes32 message,
    address owner,
    uint256 votesFor,
    uint256 votesAgainst,
    uint256 voteStart,
    uint256 voteEnd
  );

  struct Proposal {
    bytes32 message;

    uint256 id;
    address owner;
    uint256 votesFor;
    uint256 votesAgainst;
    uint256 voteStart;
    uint256 voteEnd;
  }

  uint constant public MaxProposalsAllowed = 3;
  uint constant public ProposalTimeToLive = 19725; // 3 days
  
  IVotes public token;
  mapping(uint => Proposal) public proposals;
  mapping(uint256 => mapping(address => bool)) votedForProposal;
  uint256[] public activeProposals;
  uint256 public latestProposalId;

  constructor(IVotes _token) {
    token = _token;
  }

  function getProposalById(uint256 _id)
    public
    view
    returns (uint256 id, bytes32 message, address owner, uint256 votesFor, uint256 votesAgainst, uint256 voteStart, uint256 voteEnd) {
    Proposal memory proposal = proposals[_id];
    require(proposal.voteStart != 0, "Proposal does not exist");

    return (proposal.id, proposal.message, proposal.owner, proposal.votesFor, proposal.votesAgainst, proposal.voteStart, proposal.voteEnd);
  }

  function isProposalAlive(uint256 proposalId) public view returns (bool) {
    Proposal memory proposal = proposals[proposalId];
    return proposal.voteStart <= block.number && block.number < proposal.voteEnd;
  }

  function propose(bytes32 message) public returns (uint256) {
    removeOldestProposalIfNeeded();

    require(activeProposals.length < MaxProposalsAllowed, "Max amount of proposals is already reached");

    uint256 proposalId = ++latestProposalId;

    Proposal storage proposal = proposals[proposalId];

    uint256 snapshot = block.number;
    uint256 deadline = snapshot + ProposalTimeToLive;

    proposal.voteStart = snapshot;
    proposal.voteEnd = deadline;
    proposal.owner = msg.sender;
    proposal.message = message;
    proposal.id = proposalId;

    activeProposals.push(proposalId);

    emit ProposalCreated(
      proposalId,
      message,
      msg.sender,
      snapshot,
      deadline
    );

    return proposalId;
  }

  function vote(uint256 proposalId, bool isFor) public {
    Proposal storage proposal = proposals[proposalId];
    require(proposal.voteStart != 0, "Proposal does not exist");

    require(!votedForProposal[proposalId][msg.sender], "Account has already voted");
    votedForProposal[proposalId][msg.sender] = true;

    uint256 votes = token.getPastVotes(msg.sender, proposal.voteStart);

    if (isFor) {
      proposal.votesFor += votes;
    } else {
      proposal.votesAgainst += votes;
    }

    emit VoteSubmitted(
      proposalId,
      msg.sender,
      votes,
      isFor,
      isFor ? proposal.votesFor : proposal.votesAgainst
    );

    executeProposalIfPossible(proposal);
  }

  function executeProposalIfPossible(Proposal memory proposal) private {
    uint256 tokenPastTotalSupply = token.getPastTotalSupply(proposal.voteStart);
    if (proposal.votesFor * 2 <= tokenPastTotalSupply && proposal.votesAgainst * 2 <= tokenPastTotalSupply) {
      return;
    }

    for (uint i = 0; i < activeProposals.length; ++i) {
      if (activeProposals[i] == proposal.id) {
        removeProposalByIdx(i);

        bool success;
        if (proposal.votesFor * 2 > tokenPastTotalSupply) {
          success = true;
        } else {
          success = false;
        }

        emit ProposalExecuted(
          proposal.id,
          proposal.message,
          proposal.owner,
          proposal.votesFor,
          proposal.votesAgainst,
          proposal.voteStart,
          proposal.voteEnd,
          msg.sender,
          success
        );

        return;
      }
    }
    revert("Failed to find proposalId in activeProposals array");
  }

  function removeOldestProposalIfNeeded() private {
    if (activeProposals.length == 0) {
      return;
    }

    for (uint i = 0; i < activeProposals.length; ++i) {
      uint256 proposalId = activeProposals[i];
      if (!isProposalAlive(proposalId)) {
        removeProposalByIdx(i);
        Proposal memory proposal = proposals[proposalId];
        emit ProposalDiscarded(
          proposal.id,
          proposal.message,
          proposal.owner,
          proposal.votesFor,
          proposal.votesAgainst,
          proposal.voteStart,
          proposal.voteEnd
        );
        return;
      }
    }
  }

  function removeProposalByIdx(uint256 idx) private {
    activeProposals[idx] = activeProposals[0];
    activeProposals.pop();
  }
}
