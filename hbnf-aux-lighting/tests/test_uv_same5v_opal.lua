-- Native Lua execution for the real Opal readiness implementation, with
-- synthetic profile values only. No device, broker, lamp or network access.
package.preload["cjson.safe"] = function() return { decode = function() return nil end } end
local runtime = dofile("staging/coordinated-backend/opal/owner-local-control/uv_runtime.lua")
local gates = {
  "installedBoardInputAndNmosSinkVerified",
  "controllerAndUv5vSameRailVerified",
  "oldConstantGroundUvBypassesRemoved",
  "separate12vWs2811RailAndGpio16DataVerified",
  "gpio16DataMarginsAndPowerSequencingVerified",
  "crossRailBackfeedAbsentVerified",
  "measuredConverterHeadroomPeakAndInrushVerified",
  "individuallyFusedBranchesAndWiresVerified",
  "dummyLoadTwoIndependentPwmChannelsVerified",
  "uvOnlyNormallyOpenHardCutoffVerified",
  "lidOpticalInterlockAndOpaqueShieldingVerified",
  "controllerResetAndBrownoutWatchdogFailsOpenVerified",
  "faultPowerLossRequiresManualRearmVerified",
  "directWledBypassCannotEnergizeUnarmedUvVerified",
  "physicalUvOffAtBothLoadsVerified",
  "shieldedIndependentDimmingAndMusicFollowVerified"
}
local spec = {
  schema = "hbnf-uv-same-5v-low-side-review-v1",
  method = "onboard_sp803e_nmos_same_5v_rail",
  controllerSupplyVoltageV = 5, uvLoadVoltageV = 5,
  addressableSupplyVoltageV = 12, addressableDataGpio = 16, addressableGroups = 22,
  sharedSupplyTopology = "same_regulated_5v_controller_and_uv_branch_with_independent_12v_ws2811",
  controllerSupply = "TOBSUN EA50-5V",
}
local policy = {
  same5vCandidate=spec, same5vRequiredSafetyGates=gates,
  requiredRuntimeGates={"auxEnabled","uvEnabled","uvOutputsVerified","hardwareReady"},
  requiredCommissioningGates={"hardware_wired","power_verified"},
  requiredPhysicalSafetyGates={"externalSignalToLoadIsolationVerified"},
  brightness={maximum=255},
  channels={main={gpio=25,segmentId=1}, short={gpio=26,segmentId=2}},
  switching={method="opto_isolated_cv_pwm_repeater",controlVoltage=12,loadVoltage=5,
    channels=2,pwmFrequencyHz={minimum=200,maximum=2000}}
}
local physical={}
for _,gate in ipairs(gates) do physical[gate]=true end
local profile={
  schema="hbnf-aux-uv-hardware-profile-v1", verified=true, evidence="SYNTHETIC-BENCH-ONLY",
  topologyId=spec.schema,
  physicalSafety=physical,
  runtimeGates={auxEnabled=true,uvEnabled=true,uvOutputsVerified=true},
  commissioningGates={hardware_wired=true,power_verified=true},
  hardwareQualification={
    boardRevision="FIXTURE-NOT-REAL", installedBoardEvidenceSha256=string.rep("a",64),
    dummyLoadAndOpticalAcceptanceSha256=string.rep("b",64),
    manufacturerRatedLowSideOutputs=true, manualResetNoAutoRearmObserved=true,
    gpio16AddressableRailPreserved=true,
  },
  switching={
    verified=true, isolated=false, method=spec.method, inputVoltageV=5,outputVoltageV=5,
    maxLoadVoltageV=5,channels=2,maxChannelCurrentMa=6000,maxTotalCurrentMa=12000,
    pwmFrequencyHz=19531, measuredPwmFrequencyHz=19520,
  },
  sharedSupply={
    verified=true,topology=spec.sharedSupplyTopology,converter="TOBSUN EA50-5V",
    controllerInputVoltageV=5,addressableSupplyVoltageV=12,addressableDataGpio=16,
    addressableGroups=22,fuseRatingMa=5000,trunkWireCurrentRatingMa=6000,
    converterOutputContinuousRatingMa=10000,controllerCurrentMarginMa=400,
    measuredCombinedPeakMa=2700,currentLimitMa=9000,
  },
  supplyByChannel={main={outputVoltageV=5,currentLimitMa=3000},
    short={outputVoltageV=5,currentLimitMa=2500}},
  channels={
    main={gpio=25,segmentId=1,loadVoltageV=5,loadCurrentMa=800,
      measuredPeakCurrentMa=1100,fuseRatingMa=1500,wireCurrentRatingMa=2000},
    short={gpio=26,segmentId=2,loadVoltageV=5,loadCurrentMa=520,
      measuredPeakCurrentMa=800,fuseRatingMa=1000,wireCurrentRatingMa=1500},
  },
  maxBrightness=190,
}
local count=0
local function accepted(label)
  local ok, why=runtime.profile_ready(profile,policy)
  assert(ok == true, label .. " expected true, received "..tostring(why))
  count=count+1
end
local function rejected(label)
  local ok,why=runtime.profile_ready(profile,policy)
  assert(ok == false, label .. " unexpectedly passed")
  assert(type(why)=="string" and why~="",label.." lacked denial reason")
  count=count+1
end
local function reject_change(tbl,key,value,label)
  local old=tbl[key]
  tbl[key]=value
  rejected(label or key)
  tbl[key]=old
end
accepted("synthetic fully attested same-5V fixture")
for _,g in ipairs(gates) do
  reject_change(profile.physicalSafety,g,false,"required physical safety "..g)
end
for _,key in ipairs({"auxEnabled","uvEnabled","uvOutputsVerified"}) do
  reject_change(profile.runtimeGates,key,false,"runtime "..key)
end
for _,key in ipairs({"hardware_wired","power_verified"}) do
  reject_change(profile.commissioningGates,key,false,"commissioning "..key)
end
reject_change(profile,"topologyId","historical_12v","correct topology")
reject_change(profile.switching,"isolated",true,"unqualified isolation")
reject_change(profile.switching,"inputVoltageV",12,"12V controller not same rail")
reject_change(profile.switching,"outputVoltageV",12,"12V UV not same rail")
reject_change(profile.switching,"measuredPwmFrequencyHz",1500,"PWM actual mismatch")
reject_change(profile.sharedSupply,"addressableDataGpio",25,"GPIO16 preservation")
reject_change(profile.sharedSupply,"addressableGroups",24,"DDP22 preservation")
reject_change(profile.sharedSupply,"measuredCombinedPeakMa",1200,"missing peak budget")
reject_change(profile.sharedSupply,"trunkWireCurrentRatingMa",1000,"fuse trunk ampacity")
reject_change(profile.channels.main,"fuseRatingMa",500,"rim overcurrent")
reject_change(profile.channels.short,"segmentId",1,"independent bar segment")
reject_change(profile.hardwareQualification,"manualResetNoAutoRearmObserved",false,"no-auto-rearm")
reject_change(profile.hardwareQualification,"installedBoardEvidenceSha256","bad","installed identity")
reject_change(profile,"verified",false,"as-built remains unverified")
print(string.format("HBNF_UV_SAME5V_OPAL_NATIVE_PASS %d cases; SYNTHETIC ONLY",count))
