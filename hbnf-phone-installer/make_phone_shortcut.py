#!/usr/bin/env python3
"""Generate the HBNF iPhone field-OTA Shortcut.

The generated shortcut:
- verifies the two expected iPhone Personal Hotspot clients (.2/.3) by WLED LED count,
- safely maps Matrix (512 LEDs) vs AUX (22 LEDs), regardless of DHCP ordering,
- loads the two matched firmware files from iCloud Drive > Shortcuts > HBNF_FIELD_DEPLOY,
- uploads each image to the correct WLED /update endpoint as multipart/form-data,
- stops rather than guessing if the two devices cannot be positively identified.

The shortcut intentionally does NOT mutate Supabase production. Cloud cutover remains
server-side and can be resumed from ChatGPT/Codex after physical OTA succeeds.
"""
from __future__ import annotations
import plistlib, uuid, pathlib, argparse

U=lambda: str(uuid.uuid4()).upper()

def outref(uid:str, name:str):
    return {
        "Value":{"OutputUUID":uid,"Type":"ActionOutput","OutputName":name},
        "WFSerializationType":"WFTextTokenAttachment",
    }

def varref(name:str):
    return {
        "Value":{"VariableName":name,"Type":"Variable"},
        "WFSerializationType":"WFTextTokenAttachment",
    }

def tt(text:str):
    return {
        "Value":{"string":text,"attachmentsByRange":{}},
        "WFSerializationType":"WFTextTokenString",
    }

def token_string(prefix_var:str, suffix:str):
    s="\uFFFC"+suffix
    return {
        "Value":{
            "string":s,
            "attachmentsByRange":{
                "{0, 1}":{"VariableName":prefix_var,"Type":"Variable"}
            },
        },
        "WFSerializationType":"WFTextTokenString",
    }

def action(identifier:str, **params):
    params.setdefault("UUID", U())
    return {"WFWorkflowActionIdentifier":identifier,"WFWorkflowActionParameters":params}

def setvar(name:str, source_uid:str, output_name:str):
    return action("is.workflow.actions.setvariable",
                  WFVariableName=name,
                  WFInput=outref(source_uid, output_name))

def text_action(value:str):
    uid=U()
    return uid, {"WFWorkflowActionIdentifier":"is.workflow.actions.gettext",
                 "WFWorkflowActionParameters":{"UUID":uid,"WFTextActionText":value}}

def form_field_text(key:str,value:str):
    return {"WFKey":tt(key),"WFItemType":0,"WFValue":tt(value)}

def form_field_file(key:str, source_uid:str, output_name:str="File"):
    return {
        "WFKey":tt(key),
        "WFItemType":5,
        "WFValue":{
            "Value":{
                "Value":{
                    "OutputUUID":source_uid,
                    "Type":"ActionOutput",
                    "OutputName":output_name,
                },
                "WFSerializationType":"WFTextTokenAttachment",
            },
            "WFSerializationType":"WFTokenAttachmentParameterState",
        },
    }

def upload_action(base_var:str, file_uid:str):
    return action(
        "is.workflow.actions.downloadurl",
        WFURL=token_string(base_var,"/update"),
        WFHTTPMethod="POST",
        WFHTTPBodyType="Form",
        ShowHeaders=False,
        WFFormValues={
            "Value":{"WFDictionaryFieldValueItems":[
                form_field_text("skipValidation","1"),
                form_field_file("update",file_uid),
            ]},
            "WFSerializationType":"WFDictionaryFieldValue",
        },
    )

def build() -> dict:
    a=[]

    # Friendly first-run notice. Local Network permission may follow on iPhone.
    a.append(action("is.workflow.actions.alert",
                    WFAlertActionTitle="HBNF Field Install",
                    WFAlertActionMessage=(
                        "Use this only with the cart powered on and connected to this iPhone's "
                        "Personal Hotspot. Keep only the Matrix and AUX connected to the hotspot. "
                        "The shortcut verifies which is which before flashing."
                    ),
                    WFAlertActionCancelButtonShown=True))

    # Probe the first two hotspot DHCP clients. A freshly toggled iPhone Personal Hotspot
    # with only Matrix+AUX connected assigns the two cart nodes here.
    info2_uid=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.downloadurl",
              "WFWorkflowActionParameters":{
                  "UUID":info2_uid,"WFURL":"http://172.20.10.2/json/info",
                  "WFHTTPMethod":"GET","ShowHeaders":False}})

    count2_uid=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.getvalueforkey",
              "WFWorkflowActionParameters":{
                  "UUID":count2_uid,
                  "WFInput":outref(info2_uid,"Contents of URL"),
                  "WFGetDictionaryValueType":"Value",
                  "WFDictionaryKey":"leds.count"}})

    info3_uid=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.downloadurl",
              "WFWorkflowActionParameters":{
                  "UUID":info3_uid,"WFURL":"http://172.20.10.3/json/info",
                  "WFHTTPMethod":"GET","ShowHeaders":False}})

    count3_uid=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.getvalueforkey",
              "WFWorkflowActionParameters":{
                  "UUID":count3_uid,
                  "WFInput":outref(info3_uid,"Contents of URL"),
                  "WFGetDictionaryValueType":"Value",
                  "WFDictionaryKey":"leds.count"}})

    # IF .2 == 512
    g1=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{
                  "UUID":U(),"GroupingIdentifier":g1,"WFControlFlowMode":0,
                  "WFCondition":4,"WFConditionalActionString":"512",
                  "WFInput":{"Type":"Variable","Variable":outref(count2_uid,"Dictionary Value")}}})

    # inner IF .3 == 22
    g2=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{
                  "UUID":U(),"GroupingIdentifier":g2,"WFControlFlowMode":0,
                  "WFCondition":4,"WFConditionalActionString":"22",
                  "WFInput":{"Type":"Variable","Variable":outref(count3_uid,"Dictionary Value")}}})
    t,ta=text_action("http://172.20.10.2"); a.append(ta); a.append(setvar("MatrixBase",t,"Text"))
    t,ta=text_action("http://172.20.10.3"); a.append(ta); a.append(setvar("AuxBase",t,"Text"))

    # ELSE inner
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{
                  "UUID":U(),"GroupingIdentifier":g2,"WFControlFlowMode":1}})
    a.append(action("is.workflow.actions.alert",
                    WFAlertActionTitle="Cart identity failed",
                    WFAlertActionMessage=(
                        "172.20.10.2 looks like the Matrix, but 172.20.10.3 is not the 22-LED AUX. "
                        "Turn Personal Hotspot off/on, power-cycle the cart, keep other hotspot clients disconnected, and rerun."
                    ),
                    WFAlertActionCancelButtonShown=False))
    a.append(action("is.workflow.actions.exit"))
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{
                  "UUID":U(),"GroupingIdentifier":g2,"WFControlFlowMode":2}})

    # ELSE outer: test .2 == 22 and .3 == 512 (reversed DHCP order)
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{
                  "UUID":U(),"GroupingIdentifier":g1,"WFControlFlowMode":1}})
    g3=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{
                  "UUID":U(),"GroupingIdentifier":g3,"WFControlFlowMode":0,
                  "WFCondition":4,"WFConditionalActionString":"22",
                  "WFInput":{"Type":"Variable","Variable":outref(count2_uid,"Dictionary Value")}}})
    g4=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{
                  "UUID":U(),"GroupingIdentifier":g4,"WFControlFlowMode":0,
                  "WFCondition":4,"WFConditionalActionString":"512",
                  "WFInput":{"Type":"Variable","Variable":outref(count3_uid,"Dictionary Value")}}})
    t,ta=text_action("http://172.20.10.3"); a.append(ta); a.append(setvar("MatrixBase",t,"Text"))
    t,ta=text_action("http://172.20.10.2"); a.append(ta); a.append(setvar("AuxBase",t,"Text"))
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{"UUID":U(),"GroupingIdentifier":g4,"WFControlFlowMode":1}})
    a.append(action("is.workflow.actions.alert",
                    WFAlertActionTitle="Cart identity failed",
                    WFAlertActionMessage=(
                        "172.20.10.2 looks like AUX, but 172.20.10.3 is not the 512-LED Matrix. "
                        "Reset the hotspot/cart connection and rerun."
                    ),
                    WFAlertActionCancelButtonShown=False))
    a.append(action("is.workflow.actions.exit"))
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{"UUID":U(),"GroupingIdentifier":g4,"WFControlFlowMode":2}})
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{"UUID":U(),"GroupingIdentifier":g3,"WFControlFlowMode":1}})
    a.append(action("is.workflow.actions.alert",
                    WFAlertActionTitle="Cart not at hotspot defaults",
                    WFAlertActionMessage=(
                        "The cart was not positively identified at 172.20.10.2/.3. "
                        "Turn Personal Hotspot off/on, power-cycle the cart, disconnect other hotspot clients, then rerun. "
                        "Nothing was flashed."
                    ),
                    WFAlertActionCancelButtonShown=False))
    a.append(action("is.workflow.actions.exit"))
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{"UUID":U(),"GroupingIdentifier":g3,"WFControlFlowMode":2}})
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.conditional",
              "WFWorkflowActionParameters":{"UUID":U(),"GroupingIdentifier":g1,"WFControlFlowMode":2}})

    # Load firmware from iCloud Drive > Shortcuts > HBNF_FIELD_DEPLOY.
    matrix_file=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.documentpicker.open",
              "WFWorkflowActionParameters":{
                  "UUID":matrix_file,
                  "WFShowFilePicker":False,
                  "WFGetFilePath":"/HBNF_FIELD_DEPLOY/HBNF_MATRIX.bin",
                  "WFFileErrorIfNotFound":True}})

    a.append(action("is.workflow.actions.alert",
                    WFAlertActionTitle="Matrix verified",
                    WFAlertActionMessage="Installing matched Matrix firmware. Keep Shortcuts open.",
                    WFAlertActionCancelButtonShown=False))
    a.append(upload_action("MatrixBase",matrix_file))
    a.append(action("is.workflow.actions.delay",WFDelayTime=12))

    aux_file=U()
    a.append({"WFWorkflowActionIdentifier":"is.workflow.actions.documentpicker.open",
              "WFWorkflowActionParameters":{
                  "UUID":aux_file,
                  "WFShowFilePicker":False,
                  "WFGetFilePath":"/HBNF_FIELD_DEPLOY/HBNF_AUX.bin",
                  "WFFileErrorIfNotFound":True}})

    a.append(action("is.workflow.actions.alert",
                    WFAlertActionTitle="AUX verified",
                    WFAlertActionMessage="Installing matched AUX firmware. Keep Shortcuts open.",
                    WFAlertActionCancelButtonShown=False))
    a.append(upload_action("AuxBase",aux_file))
    a.append(action("is.workflow.actions.delay",WFDelayTime=12))

    # Final verification: both endpoints should return after reboot. This is reachability-only;
    # exact witnesses are verified by the cloud cutover/acceptance step.
    a.append(action("is.workflow.actions.downloadurl",
                    WFURL=token_string("MatrixBase","/json/info"),
                    WFHTTPMethod="GET",ShowHeaders=False))
    a.append(action("is.workflow.actions.downloadurl",
                    WFURL=token_string("AuxBase","/json/info"),
                    WFHTTPMethod="GET",ShowHeaders=False))

    a.append(action("is.workflow.actions.alert",
                    WFAlertActionTitle="Firmware installed",
                    WFAlertActionMessage=(
                        "Both WLED nodes returned after OTA. Open ChatGPT/Codex and send: "
                        "HBNF PHONE OTA COMPLETE — resume approved production cutover."
                    ),
                    WFAlertActionCancelButtonShown=False))

    return {
        "WFWorkflowMinimumClientVersion":900,
        "WFWorkflowMinimumClientVersionString":"900",
        "WFWorkflowIcon":{"WFWorkflowIconStartColor":431817727,"WFWorkflowIconGlyphNumber":59511},
        "WFWorkflowTypes":["NCWidget"],
        "WFWorkflowInputContentItemClasses":["WFStringContentItem","WFGenericFileContentItem"],
        "WFWorkflowActions":a,
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("output")
    ns=ap.parse_args()
    out=pathlib.Path(ns.output).expanduser().resolve()
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open("wb") as f:
        plistlib.dump(build(),f,fmt=plistlib.FMT_BINARY,sort_keys=False)
    print(f"HBNF_PHONE_SHORTCUT_UNSIGNED={out}")
    print(f"HBNF_PHONE_SHORTCUT_BYTES={out.stat().st_size}")

if __name__=="__main__":
    main()
