const express = require('express')
const bodyParser = require('body-parser')
const persephonySDK = require('@persephony/sdk')

const app = express()
app.use(bodyParser.json())
// Where your app is hosted ex. www.myapp.com
const host = process.env.HOST
const port = process.env.PORT || 3000
// your Persephony API key (available in the Dashboard) - be sure to set up environment variables to store these values
const accountId = process.env.accountId
const authToken = process.env.authToken
const persephony = persephonySDK(accountId, authToken)

app.post('/incomingCall', (req, res) => {
  const conference = persephony.percl.createConference(`${host}/conferenceCreated`)
  const percl = persephony.percl.build(conference)
  res.status(200).json(percl)
})

app.post('/conferenceCreated', (req, res) => {
  const createConferenceResponse = req.body
  const conferenceId = createConferenceResponse.conferenceId
  const say = persephony.percl.say('Please wait while we attempt to connect you to an agent.')
  // implementation of lookupAgentPhoneNumber() is left up to the developer
  const agentPhoneNumber = lookupAgentPhoneNumber()
  // Make OutDial request once conference has been created
  const options = {
    // Hangup if we get a voicemail machine
    ifMachine: persephony.enums.ifMachine.hangup
  }
  const outDial = persephony.percl.outDial(agentPhoneNumber, createConferenceResponse.from, `${host}/outboundCallMade/${conferenceId}`, `${host}/callConnected/${conferenceId}`, options)
  const percl = persephony.percl.build(say, outDial)
  res.status(200).json(percl)
})

app.post('/outboundCallMade/:conferenceId', (req, res) => {
  const outboundCallResponse = req.body
  const conferenceId = req.params.conferenceId
  // set the leaveConferenceUrl for the inbound caller, so that we can terminate the conference when they hang up
  const options = {
    leaveConferenceUrl: `${host}/leftConference`
  }
  // Add initial caller to conference
  const addToConference = persephony.percl.addToConference(conferenceId, outboundCallResponse.callId, options)
  const percl = persephony.percl.build(addToConference)
  res.status(200).json(percl)
})

app.post('/callConnected/:conferenceId', (req, res) => {
  const callConnectedResponse = req.body
  const conferenceId = req.params.conferenceId
  if (callConnectedResponse.dialCallStatus != persephony.enums.callStatus.IN_PROGRESS) {
    // Terminate conference if agent does not answer the call. Can't use PerCL command since PerCL is ignored if the call was not answered.
    terminateConference(conferenceId)
    return res.status(200).json([])
  }
  const addToConference = persephony.percl.addToConference(conferenceId, callConnectedResponse.callId)
  const percl = persephony.percl.build(addToConference)
  res.status(200).json(percl)
})

app.post('/leftConference', (req, res) => {
  // Call terminateConference when the initial caller hangsups
  const leftConferenceResponse = req.body
  const conferenceId = leftConferenceResponse.conferenceId
  terminateConference(conferenceId)
  res.status(200).json([])
})

function terminateConference(conferenceId) {
  // Create the ConferenceUpdateOptions and set the status to terminated
  const options = {
    status: persephony.enums.conferenceStatus.TERMINATED
  }
  persephony.api.conferences.update(conferenceId, options).catch(err => {/* Handle Errors */ })
}

// Specify this route with 'Status Callback URL' in App Config
app.post('/status', (req, res) => {
  // handle status changes
  res.status(200)
})

app.listen(port, () => {
  console.log(`Starting server on port ${port}`)
})