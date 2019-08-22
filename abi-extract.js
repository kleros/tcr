// This is a tool that extracts the contract abi from the output
// of truffle compile and writes it to the abi folder at root of this repo.
//
// We do this to allow clients to conveniently import the abi from this
// package, while avoiding polluting git history with build changes.

const fs = require('fs')
const path = require('path')
const jsonfile = require('jsonfile')

const buildPath = path.join(__dirname, 'build/contracts/')

fs.readdir(buildPath, (err, files) => {
  if (err) throw err

  files.forEach(file => {
    jsonfile.readFile(`${buildPath}${file}`, (err, { abi }) => {
      if (err) throw err
      jsonfile.writeFile(`abi/${file}`, abi, { spaces: 2 })
    })
  })
})
