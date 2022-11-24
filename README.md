# Simple Voting Contract

This project contains a pack of contacts covered with tests that allows users to vote for proposals using token balances.

By default only `3` proposals can be alive at a time. When adding a new proposal, one obsolete proposal will be discarded.

`Voting` contract uses `ERC20` tokens with `ERC20Votes` extension to represent voting power

Proposal is simple `bytes32` message that can be accepted, discarded or rejected depending on amount of votes. Proposal time to live is `3 days`. After this time period proposal may be discarded if votes limit was not reached

# `Voting` contract
## Main functons
1. `propose(bytes32 message)`. Creates new proposal with corresponding message. Reverts if max proposals limit is already reached
2. `vote(uint256 proposalId, bool isFor)`. Votes for or against the proposal with voting power equal `token.getPastVotes(msg.sender, proposal.voteStart)`. Reverts if proposal with such id does not exist or address has already voted for it
## Events
  1. `ProposalCreated` is emitted on successfull `propose(...)` call
  2. `ProposalExecuted` is emitted when `votesFor * 2 > tokenSupply` or `votesAgainst * 2 > tokenSupply`
  3. `ProposalDiscarded` is emitted when outdated proposal is discarded
  4. `VoteSubmitted` is emitted on successfull `vote(...)` call

# `VotingToken` contract
It is token which can be used as voting token for `Voting` contract

# Tests

```
node i
npx hardhat test
```
## Example output:
```
➜  simple_voting_contract git:(master) ✗ npx hardhat test


  Voting
    Deployment
      ✔ VotingToken should have correct supply and decimals (889ms)
      ✔ Voting should set correct token address, maxProposalsAllowed and proposalTimeToLive
    propose(...)
      ✔ propose(...) should emit ProposalCreated event
      ✔ propose(...) should emit event with correct args
      ✔ Proposal from contract should be equal proposal from ProposalCreated event
      ✔ Maximum 3 active proposals should be allowed at a time
      ✔ Oldest outdated proposal should be removed on propose(...) call
      ✔ propose(...) should emit ProposalDiscarded event for outdated proposal (48ms)
    vote(...) function
      ✔ vote(..., true) increase votes correctly
      ✔ vote(..., false) decrease votes correctly
      ✔ Second vote from single account should be rejected
      ✔ Token transfer should not add voting power (66ms)
      ✔ ProposalExecuted event with success:true should be emmited when reached enough votesFor (49ms)
      ✔ ProposalExecuted event with success:false should be emmited when reached enough votesAgainst (49ms)
      ✔ VoteSubmitted event should be emited on successfull vote for call
      ✔ VoteSubmitted event should be emited on successfull vote against call


  16 passing (1s)
```
