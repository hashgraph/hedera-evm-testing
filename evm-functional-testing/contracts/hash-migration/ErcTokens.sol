// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// Plain Solidity tokens: their whole state is contract storage. Minting is open to keep the tests simple.
contract MigrationERC20 is ERC20 {
    constructor() ERC20("Migration ERC20", "MERC20") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MigrationERC721 is ERC721 {
    constructor() ERC721("Migration ERC721", "MERC721") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "https://example.com/erc721/";
    }
}

contract MigrationERC1155 is ERC1155 {
    constructor() ERC1155("https://example.com/erc1155/{id}.json") {}

    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts) external {
        _mintBatch(to, ids, amounts, "");
    }
}
