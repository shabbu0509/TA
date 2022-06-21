import 'whatwg-fetch'
import { heatMapApplication, rolesTab } from '../utils/jsonData';
import { parseFloat, addZero, setTimeZone, getMarketImpact } from '../utils';

import Actions from './Actions';

// Webpack Defined Variable
const baseURL = WP_API_URL + 'proxyCall/'
const predictionBaseURL = baseURL + 'prediction/';

const webtraffic = predictionBaseURL + 'webtraffic';
const database = predictionBaseURL + 'database';
const webtrafficMore = predictionBaseURL + 'webtraffic/hour';

const httpCall = (source, method, url, body) => {
    let headers = new Headers();

    let request = {
        method: method,
        headers: headers
    }

    // If the request is NOT a GET or HEAD, set a body
    if (!(method === "GET" || method === "HEAD")) {
        request.body = JSON.stringify(body); // To work with the Fetch API, the body needs to be stringified first.
    }

    return fetch(url, request)
        .then(
            response => {
                if (response.status === 401) {
                    let data = { 'error': true, 'errorCode': '401', 'errorMessage': 'Unauthorized access'}
                    return data
                    }
                if (response.ok) { return response }
                else {
                   throw response
                }
            })
        .catch(response => {
            throw response
        })
}

let jsonOSList, jsonCFFList;
const jsonList = (responseData, service) => {
    try {
        var items = responseData.items
            .sort((a, b) => a.service_level - b.service_level)
            .map(data => {
                return {
                    service: data.service,
                    market: data.market,
                    function: data.function,
                    alert_severity: data.alert_severity,
                    alert_value: data.alert_value,
                    parent: data.parent,
                    alert_health: (data.kpi === 'ServiceHealthScore') ? data.alert_value : 0,
                    current: data.alert_value && parseFloat(data.alert_value),
                    alert_level: data.alert_level,
                    kpi: data.kpi,
                    kpiid: data.kpiid,
                    serviceid: data.serviceid,
                    service_level: data.service_level,
                    alert_color: data.alert_color,
                    unit: data.unit,
                    trendField: data.trendField
                };
            });
        if (service === 'os') {
            jsonOSList = items
        } else {
            jsonCFFList = items
        }
        return items;
    } catch(error) {
        throw error;
    }
}

const jsonTrend = (result) => {
    try {
        const avgValueArr = result.avgValue.split(',');
        const removedNA = [...avgValueArr].filter(v => v !== 'N/A')
        const minVal = Math.min(...removedNA)
        const avgValue = avgValueArr
                        .map((e) => (e === 'N/A') ? minVal : parseInt(e))
        const trendTimeArr = (result._time).split(',')
        const response = {
                "avgValue": avgValue,
                "time": trendTimeArr,
                "minValLegend": Math.min(...avgValue),
                "maxValLegend": Math.max(...avgValue),
                "error": false
            };

        return response;
    } catch (error) {
        throw error;
    }
}

const getAPIViewData = (data) => {

    let finalData = data.reduce(function (acc, currData) {
        function getParent(s, b) {
            return b.service === currData.parentService ? b : (b.children && b.children.reduce(getParent, s));
        }
        let index = 0, node;
        if ('parentService' in currData) {
            node = acc.reduce(getParent, {});
        }
        if (node && Object.keys(node).length) {
            node.children.push(currData);
        } else {
            while (index < acc.length) {
                if (acc[index].parentService === currData.service) {
                    currData.children = (currData.children || []).concat(acc.splice(index, 1));
                } else {
                    index++;
                }
            }
            acc.push(currData);
        }
        return acc;
    }, []);

    return finalData;
}

export default class Middleware {

    static fetchAll(market) {
        return dispatch => {
            dispatch(Actions.setIsLoading(true))

            if(!WP_APP_ISPROD) {
                // dispatch(Middleware.fetchOSServices(market));
                // dispatch(Middleware.fetchapiView())
            }
            dispatch(Middleware.fetchStatusPage(market));
            dispatch(Middleware.fetchProductFlow(market));
            dispatch(Middleware.fetchProductFlowTrends(market));
            dispatch(Middleware.fetchBusinessCustomerJourney(market));
            // dispatch(Middleware.fetchCFFServices(market));
            // dispatch(Middleware.fetchConvHistory(market));
            dispatch(Middleware.fetchE2ETrend(market))
            dispatch(Middleware.fetchE2EDetailed(market))
            dispatch(Middleware.fetchOSHistoricalTrends(market))
        }
    }

    static fetchCFFServices(market) {
        let customTimespan;
        if (market.endTime === 'Custom') {
            customTimespan = market.customTimeSpan
        }
        let timespan = market.endTime === 'Today'
                            ? '1d'
                            : market.endTime === 'Custom'
                                ? customTimespan
                                : market.endTime;

        let flowCFFData = {}, serviceList = [], businessvalue = [], cffServiceHealth = [];
        let cffOrdersKPI = { 'ordersCreated': null, 'ordersReleased': null, 'ordersFulfilled': null, 'ordersDelivered': null};
        let earliest = (market.startDate).getTime() / 1000;
        let latest = (market.endDate).getTime() / 1000;

        return dispatch => {
            httpCall("splunk", "GET", baseURL + `get-cff?market=${market.name}&earliest=${earliest}&latest=${latest}&timespan=${timespan}`)
            .then(response => {
              if(response.error){
                // dispatch(Actions.setServerError(response));
                dispatch(Actions.setCFFHistoricalTrends({
                    "minValLegend": '',
                    "maxValLegend": '',
                    "error" : "No data available..."
                }))
                dispatch(Actions.setIsLoading(false))
              }
            else{
                 response.json().then(data => {
                if (data.items && data.items.length > 0) {
                    serviceList = jsonList(data, 'cff').filter((v,i) => v.kpi === 'ServiceHealthScore')
                    businessvalue = jsonList(data, 'cff').filter((v,i)=> v.function==="Business")
                    jsonList(data, 'cff').map((v, i) => {
                        if (v.kpi === 'Orders count - Total') {
                            cffOrdersKPI['ordersCreated'] = v.current
                        } else if (v.kpi === 'Released Orders - Total') {
                            cffOrdersKPI['ordersReleased'] = v.current
                        // } else if (v.kpi === 'Orders fulfilled in last 1 hr') {
                        } else if (v.kpi === 'Orders fulfilled*') {
                            cffOrdersKPI['ordersFulfilled'] = v.current
                        // } else if (v.kpi === 'Count of Orders Delivered') {
                        } else if (v.kpi === 'Orders Delivered*') {
                            cffOrdersKPI['ordersDelivered'] = v.current
                        }
                    })
                    cffServiceHealth = serviceList.filter((v, i) => ((v.function).toUpperCase() === (market.name).toUpperCase()) && v.kpi === "ServiceHealthScore")
                    const cffQualityKPI = serviceList.filter((v, i) => {
                        return ((v.market).toUpperCase() === (market.name).toUpperCase()
                                && v.function === 'Data Quality'
                                && v.kpi === 'ServiceHealthScore')
                    })

                    flowCFFData = {
                        'cffOrdersKPI': cffOrdersKPI,
                        'cffServiceHealth': (cffServiceHealth.length > 0) ? cffServiceHealth[0] : {},
                        'cffQualityKPI': (cffQualityKPI.length >0) ? cffQualityKPI[0] : [],
                        'error': false

                    }
                }
                else{
                    flowCFFData = {
                        'cffOrdersKPI': '',
                        'cffServiceHealth': {},
                        'cffQualityKPI': [],
                        'error': "Data not available"

                    }
                }
                // serviceList.push({
                //     "service": "TA:CFF:Global:Orders Created",
                //     "market": "Global",
                //     "function": "Landing Page",
                //     "alert_severity": "normal",
                //     "alert_value": "75",
                //     "alert_health": "100",
                //     "current": "100",
                //     "alert_level": "2",
                //     "kpi": "ServiceHealthScore",
                //     "kpiid": "SHKPI-f3089ed8-2817-45b9-b74c-f87cd732b64e",
                //     "serviceid": "f3089ed8-2817-45b9-b74c-f87cd732b64e",
                //     "service_level": "4",
                //     "alert_color": "#0A8A00",
                //     "unit": "%",
                //     "trendField": "ServiceHealthScore"
                // })
                dispatch(Actions.setFlowCFFService(serviceList))
                dispatch(Actions.setBusinessCFF(businessvalue))
                dispatch(Actions.setFlowCFFData(flowCFFData))
                if (cffServiceHealth.length > 0) {
                    dispatch(Middleware.fetchCFFHistoricalTrends(market, cffServiceHealth[0]))
                } else {
                    dispatch(Actions.setCFFHistoricalTrends({
                        "minValLegend": '',
                        "maxValLegend": '',
                        "error" : "No data available..."
                    }))
                    dispatch(Actions.setIsLoading(false))
                }
            })
        }
        })
        .catch(response => {
            if(response.status=== 500){
                let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
            dispatch(Actions.setServerError(dataerror));
            }
        })
        }
    }

    static fetchOSServices(market) {
        let timespan = (market.endTime === 'Today' || market.endTime === 'Custom') ? '1d' : market.endTime;
        let flowOSData = {}, serviceList = [], businessConv = [], osServiceHealth = [];
        let earliest = (market.startDate).getTime() / 1000;
        let latest = (market.endDate).getTime() / 1000;

        return dispatch => {
            httpCall("splunk", "GET", baseURL + `get-owfe?market=${market.name}&earliest=${earliest}&latest=${latest}&timespan=${timespan}`)
            .then(response =>{
                 if(response.error){
                dispatch(Actions.setServerError(response));
              }
              else{
                 response.json().then(data => {
                if (data.items && data.items.length > 0) {
                    serviceList = jsonList(data, 'os').filter((v,i,a) => a.findIndex(t=> (t.function === v.function && t.kpi === 'ServiceHealthScore')) === i)
                    businessConv = jsonList(data, 'os').filter((v,i)=> v.function==="Business")
                    const osOrderedCount = jsonList(data, 'os').filter((v, i) => v.function === "Payment" && v.kpi === 'Orders Paid')
                    const osNewVisitors = jsonList(data, 'os').filter((v, i) => v.function === "Landing Page" && v.kpi === 'New / Refreshed Session Tokens')
                    const osAddToCart = jsonList(data, 'os').filter((v, i) => v.function === "Add To Cart" && v.kpi === 'Add To Cart - Sessions')

                    osServiceHealth = serviceList.filter((v, i) => ((v.function).toUpperCase() === (market.name).toUpperCase()) && v.kpi === "ServiceHealthScore");
                    const osQualityKPI = serviceList.filter((v, i) => {
                        return ( ((v.market).toUpperCase()).includes((market.name).toUpperCase())
                                    && (v.parent === 'Data Quality')
                                    && v.kpi === 'ServiceHealthScore')
                    })

                    flowOSData = {
                        'osOrderedCount': (osOrderedCount.length > 0) ? osOrderedCount[0].current : '',
                        'osNewVisitors': osNewVisitors,
                        'osAddToCart': osAddToCart,
                        'osServiceHealth': (osServiceHealth.length > 0) ? osServiceHealth[0] : {},
                        'osQualityKPI': (osQualityKPI.length >0) ? osQualityKPI[0] : [],
                        'error': false
                    }
                }
                else{
                    flowOSData = {
                        'osOrderedCount': '',
                        'osNewVisitors': '',
                        'osAddToCart': '',
                        'osServiceHealth': {},
                        'osQualityKPI': [],
                        'error': "Data not available"

                    }
                }
                dispatch(Actions.setFlowOSService(serviceList))
                dispatch(Actions.setBusinessOS(businessConv))
                dispatch(Actions.setFlowOSData(flowOSData))
                if (osServiceHealth.length > 0) {
                   // dispatch(Middleware.fetchOSHistoricalTrends(market))
                } else {
                    dispatch(Actions.setIsLoading(false))
                    dispatch(Actions.setOSHistoricalTrends({
                            "minValLegend": '',
                            "maxValLegend": '',
                            "error" : "No data available..."
                        }))
                }
            })
        }
        })
        .catch(response => {
            if(response.status=== 500){
                let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
            dispatch(Actions.setServerError(dataerror));
            }
        })
        }
    }

    static fetchCFFKPIs(service) {
        return jsonCFFList.filter((v, i) => (v.service === service));
    }

    static fetchCFFBusinessKpis() {
        const list= jsonCFFList.filter((v,i) => v.function === 'Business' && v.kpi !== 'CFF')
        return list;
    }

    static fetchOSKPIs(service) {
        const kpiList = jsonOSList
                        .filter((v, i) => (v.function === service))
                        .sort((a,b) => (a.alert_severity).localeCompare(b.alert_severity))
        return kpiList;
    }

    static fetchOSHistoricalTrends(market) {
        let earliest = (market.startDate).getTime() / 1000;
        let latest = (market.endDate).getTime() / 1000;
        let timespan  = market.timeSpan.value

        return dispatch => {

            httpCall('prediction', 'GET', baseURL + `getProductApiHealthCheck?market=${market.id}&earlist=${(market.startDate).getTime()}&latest=${(market.endDate).getTime()}`)
            .then(response => {
               response.json().then(result => {
                   console.log(result.rawData);
                   let data = [];
                   result.data
                            .map(v => {
                        let time = [];
                         v.date.map(d=>{
                             const dDate = (d).split(/[-_]+/);
                             const epochTime = (new Date(dDate[0], dDate[1] - 1, dDate[2])).valueOf();
                             time.push(epochTime); 
                            })
                         const addtoTrendData = {
                            "avgValue" : v.succsessAverage,
                             "time": time,
                             "kpiName": v.apiName,
                             "displayName": v.displayName,  
                             "date" : v.date,                                  
                            };
                         data.push(addtoTrendData);
                         console.log(data);
                        
                            })
                     let trendsData = {
                        "data" : data,
                        "rawData" :  result.rawData,
                            };
                    
                     dispatch(Actions.setOSHistoricalTrends(trendsData))
                        dispatch(Actions.setIsLoading(false))
                     
                    })
            })

            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                dispatch(Actions.setServerError(dataerror));
                }
            })
              
        }
    }

    static fetchCFFHistoricalTrends(market) {
        let earliest = (market.startDate).getTime() / 1000;
        let latest = (market.endDate).getTime() / 1000;
        let timespan  = market.timeSpan.value

        return dispatch => {
            httpCall("splunk", "GET", baseURL + `get-trend?market=${market.name}&earliest=${earliest}&latest=${latest}&filter_level=cff&timespan=${timespan}`)
                .then(response =>{
                    if(response.error){
                        dispatch(Actions.setServerError(response));
                      }
                      else{
                        response.json().then(data => {
                        // response.json().then(result => {

                        let kpiName = [], avgValue = [], timeArr = [], displayName = [], service={};

                        // const data = cff_historical;
                        data.items
                            .map(v => {
                                displayName.push(v.display_name)
                                kpiName.push(v.kpi)
                                avgValue.push(v.avgValue
                                                    .split(',')
                                                    .map(v => (v) ? parseInt(v) : 0)
                                            )
                                service[v.kpi] = v.service
                            })
                            timeArr = data.items[0]._time
                                        .split(',')
                                        .map(v => v * 1000)
                        const trendData = {
                                "avgValue" : avgValue,
                                "time": timeArr,
                                "kpiName": kpiName,
                                "items": data.items,
                                "displayName": displayName,
                                "serviceName": service
                            };
                        dispatch(Actions.setCFFHistoricalTrends(trendData))
                        if (WP_APP_ISPROD) {
                            dispatch(Actions.setIsLoading(false))
                        }
                    })
                }
            })
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                    if (WP_APP_ISPROD) {
                        dispatch(Actions.setIsLoading(false))
                    }
                }
            })
            }
    }

    static fetchTrends(market, serviceMonitor) {
        let earliest = (market.startDate).getTime() / 1000;
        let latest = (market.endDate).getTime() / 1000;
        let timespan  = market.timeSpan.value

        let encodedTrendField = encodeURIComponent(serviceMonitor.trendField)
        return httpCall("splunk", "GET", baseURL + `get-trend?market=${market.name}&filter_level=${encodedTrendField}&kpiid=${serviceMonitor.kpiid}&service=${serviceMonitor.service}&kpi=${encodedTrendField}&earliest=${earliest}&latest=${latest}&timespan=${timespan}`)
        .then(response =>
             response.json().then(data => {
            return jsonTrend(data.items[0]);
        }))
        .catch(response => {
           throw response
        })
    }

    // Trend Analyze - multi-line chart
    static fetchMultiTrends(market, filterValue, filterLevel, serviceMonitor, levelNo, tabId) {
        let trendsData, yAxisTitle = 'Percentage';
        const nameArr = [], avgValueArr = [], timeArr = [];
        let encodedTrendField = encodeURIComponent(filterLevel)
        return dispatch => {
            httpCall("splunk", "GET", baseURL + `get-trend?market=${market.name}&service=${serviceMonitor}&${filterValue}&filter_level=${encodedTrendField}`)
                .then(response => response.json().then(trendsResult => {
                    if(trendsResult.items.length > 0) {
                        yAxisTitle = trendsResult.items[0].label
                        trendsResult.items.map((v) => {
                            let funNameWithUnit = (v.function).replaceAll(' ', '_');
                            nameArr.push(funNameWithUnit)
                            avgValueArr.push((v.avgValue).split(','))
                            timeArr.push((v._time).split(',').map(value => value * 1000))
                        })
                        trendsData = {
                                'nameArr': nameArr,
                                'avgValueArr': avgValueArr,
                                'timeArr': timeArr[0],
                                'flowHealthText': market.label,
                                'yAxisTitle': yAxisTitle,
                                'items': trendsResult.items,
                                'error': false,
                                'serviceName': serviceMonitor
                            }
                    } else {
                        trendsData =  {'error': 'No data available...'}
                    }
                    dispatch(Actions.setMultiTrendsData(trendsData, tabId, levelNo));
                    dispatch(Actions.setIsLoading(false))
                }))
                .catch(response => {
                    if(response.status=== 500){
                        let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                        dispatch(Actions.setServerError(dataerror));
                        dispatch(Actions.setIsLoading(false))
                    }
                    return errorData
                })
            }
    }


    /*
        * Service View API Calls
     */

    static fetchConvHistory(market) {
        return dispatch => {
            httpCall("splunk", "GET", baseURL + 'get-incidents' )
                .then(response =>{
                    if(response.error){
                        dispatch(Actions.setServerError(response));
                      }
                    else{
                        response.json().then(result => {
                            dispatch(Actions.setIncidentData(result))
                            dispatch(Middleware.fetchNEWSData(result))
                            dispatch(Middleware.fetchServiceViewIncidents(result, market))
                            dispatch(Middleware.fetchheatMapData(result, market.startDate))
                        })
                    }
                })
                .catch(response => {
                    if(response.status=== 500){
                        let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                        dispatch(Actions.setServerError(dataerror));
                    }
                })
        }
    }

    static fetchNEWSData(result) {
        return dispatch => {
            var bciValue = [], mbciValue = [], mainFilter;
            try{
                const { Incident_details } = result;
                //  const { Incident_details } = incidentData;
                Incident_details
                .filter(v => {
                    mainFilter = v.slack_status !== 'CLOSED' && v.slack_status !== 'RESOLVED' && (v.type === 'MBCI' || v.type === 'BCI');
                    if (mainFilter) {
                        return (v.ops_status !== 'Closed' && v.ops_status !== 'Resolved' && v.ops_status !== 'Cancelled');
                    } else {
                        return mainFilter;
                    }
                })
                .map((val)=>{
                    if(val.DESCRIPTION && val.INCIDENT_NUMBER && val.future2){
                        if((val.type =="MBCI")) {
                            mbciValue.push(String((val.DESCRIPTION).match(/MBCI.*/)) + ' - ' + val.INCIDENT_NUMBER + ' in progress & impacted service - ' + val.future2)
                        } else {
                            bciValue.push(String((val.DESCRIPTION).match(/BCI.*/)) + ' - ' + val.INCIDENT_NUMBER + ' in progress & impacted service - ' + val.future2)
                        }
                    }
                })

                const criticalMBCI = mbciValue.join(" | ")
                const criticalBCI = bciValue.join(" | ")
                dispatch(Actions.setIncidentNEWSData({ 'criticalMBCI': criticalMBCI, 'criticalBCI': criticalBCI}));
              }
             catch(error) {
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
            }
        }

    }

    static fetchServiceViewIncidents(dataParam, market) {
        var finalData = [];
        const formatter = setTimeZone();

        return dispatch => {
            const { Incident_details } = dataParam;
            if (Incident_details) {
                const findMBCI = (text) => {
                    if ((text).match(/MBCI *(\d{3})/)) {
                        return "MBCI - " + (text).match(/MBCI *(\d{3})/)[1]
                    }
                    else {
                        return "MBCI";
                    }
                }

                const findBCI = (text) => {
                    if ((text).match(/BCI *(\d{3})/)) {
                        return "BCI - " + (text).match(/BCI *(\d{3})/)[1]
                    }
                    else {
                        return "BCI";
                    }
                }

                finalData = Incident_details.sort(function (a, b) {
                    if (a.PRODUCT_NAME.toLowerCase() < b.PRODUCT_NAME.toLowerCase()) return -1
                    if (a.PRODUCT_NAME.toLowerCase() > b.PRODUCT_NAME.toLowerCase()) return 1;
                    return 0;
                }).map(v => {
                    var mbciDetails = "";
                    var bciDetails = "";
                    // Covered ta_type secenarios :  MBCI858 / MBCI / BCI,MBCI / BCI / MBCI,MBCI857
                    if(v.type === 'MBCI' || v.type === 'BCI') {
                        let type = (v.ta_type) ? v.ta_type.trim().split(',') : ''
                        if (type.length > 0) {
                            type.map(val => {
                                mbciDetails = (val.trim().match(/^MBCI*/)) ? findMBCI(v.DESCRIPTION) : mbciDetails
                                bciDetails = (val.trim().match(/^BCI*/)) ? findBCI(v.DESCRIPTION) : bciDetails
                            })
                        } else if(type) {
                            mbciDetails = (type.trim().match(/^MBCI*/)) ? findMBCI(v.DESCRIPTION) : ""
                            bciDetails = (type.trim().match(/^BCI*/)) ? findBCI(v.DESCRIPTION) : ""
                        }
                    }

                    return {
                        OWNER_GROUP: v.OWNER_GROUP,
                        Submit_Date: v.Submit_Date,
                        CATEGORIZATION_TIER_1: v.CATEGORIZATION_TIER_1 ? v.CATEGORIZATION_TIER_1 : '',
                        PRODUCT_NAME: v.PRODUCT_NAME ? v.PRODUCT_NAME : '',
                        DESCRIPTION: v.DESCRIPTION ? v.DESCRIPTION : '',
                        STATUS:v.ops_status,
                        DETAILED_DESCRIPTION:v.DETAILED_DESCRIPTION,
                        LastModifiedDate: v.LastModifiedDate,
                        INCIDENT_NUMBER: v.INCIDENT_NUMBER ? v.INCIDENT_NUMBER : '',
                        LAST_RESOLVED_DATE: v.LAST_RESOLVED_DATE,
                        mbci: mbciDetails,
                        bci: bciDetails
                    };
                });
            }

            let appCFFData = {}, appOSData = {}, appOtherData = {};
            let mbciOSCount = 0, bciOSCount = 0;
            let mbciCFFCount = 0, bciCFFCount = 0;
            let mbciOtherCount = 0, bciOtherCount = 0;
            let cffFinalData = finalData
                .filter(v =>
                    v.CATEGORIZATION_TIER_1 === 'Customer Order Fulfillment Flow'
                    && new Date(formatter.format(new Date(v.Submit_Date + '+0200'))).getTime() > new Date(formatter.format(new Date(market.startDate))).getTime()
                    && v.STATUS !== 'Closed'
                    && v.STATUS !== 'Resolved'
                    && v.STATUS !== 'Cancelled')
                .map(v => {
                    if (!appCFFData[v.PRODUCT_NAME]) {
                        appCFFData = { ...appCFFData,
                                [v.PRODUCT_NAME]: {
                                    "count": 1,
                                    "mbci": (v.mbci) ? 1 : 0,
                                    "bci": (v.bci) ? 1 : 0,
                                }
                            }
                    } else {
                        appCFFData = { ...appCFFData,
                                [v.PRODUCT_NAME]: {
                                    "count": appCFFData[v.PRODUCT_NAME].count + 1,
                                    "mbci": (v.mbci) ? appCFFData[v.PRODUCT_NAME].mbci + 1 : appCFFData[v.PRODUCT_NAME].mbci,
                                    "bci": (v.bci) ? appCFFData[v.PRODUCT_NAME].bci + 1 : appCFFData[v.PRODUCT_NAME].bci,
                                }
                        }
                    }
                    mbciCFFCount = (v.mbci) ? mbciCFFCount + 1 : mbciCFFCount;
                    bciCFFCount = (v.bci) ? bciCFFCount + 1 : bciCFFCount;
                    return v
                })

            let osFinalData = finalData
                .filter(v =>
                    v.CATEGORIZATION_TIER_1 === 'Online shopping flow'
                    && new Date(formatter.format(new Date(v.Submit_Date + '+0200'))).getTime() > new Date(formatter.format(new Date(market.startDate))).getTime()
                    && v.STATUS !== 'Closed'
                    && v.STATUS !== 'Resolved'
                    && v.STATUS !== 'Cancelled')
                .map(v => {
                    if (!appOSData[v.PRODUCT_NAME]) {
                        appOSData = { ...appOSData,
                                [v.PRODUCT_NAME]: {
                                    "count": 1,
                                    "mbci": (v.mbci) ? 1 : 0,
                                    "bci": (v.bci) ? 1 : 0,
                                }
                            }
                    } else {
                        appOSData = { ...appOSData,
                                [v.PRODUCT_NAME]: {
                                    "count": appOSData[v.PRODUCT_NAME].count + 1,
                                    "mbci": (v.mbci) ? appOSData[v.PRODUCT_NAME].mbci + 1 : appOSData[v.PRODUCT_NAME].mbci,
                                    "bci": (v.bci) ? appOSData[v.PRODUCT_NAME].bci + 1 : appOSData[v.PRODUCT_NAME].bci,
                                }
                        }
                    }
                    mbciOSCount = (v.mbci) ? mbciOSCount + 1 : mbciOSCount;
                    bciOSCount = (v.bci) ? bciOSCount + 1 : bciOSCount;
                    return v
                })

            let otherFinalData = finalData
                .filter(v =>
                    v.CATEGORIZATION_TIER_1 === 'Others'
                    && new Date(formatter.format(new Date(v.Submit_Date + '+0200'))).getTime() > new Date(formatter.format(new Date(market.startDate))).getTime()
                    && v.STATUS !== 'Closed'
                    && v.STATUS !== 'Resolved'
                    && v.STATUS !== 'Cancelled')
                .map(v => {
                    if (!appOtherData[v.PRODUCT_NAME]) {
                        appOtherData = { ...appOtherData,
                                [v.PRODUCT_NAME]: {
                                    "count": 1,
                                    "mbci": (v.mbci) ? 1 : 0,
                                    "bci": (v.bci) ? 1 : 0,
                                }
                            }
                    } else {
                        appOtherData = { ...appOtherData,
                                [v.PRODUCT_NAME]: {
                                    "count": appOtherData[v.PRODUCT_NAME].count + 1,
                                    "mbci": (v.mbci) ? appOtherData[v.PRODUCT_NAME].mbci + 1 : appOtherData[v.PRODUCT_NAME].mbci,
                                    "bci": (v.bci) ? appOtherData[v.PRODUCT_NAME].bci + 1 : appOtherData[v.PRODUCT_NAME].bci,
                                }
                        }
                    }
                    mbciOtherCount = (v.mbci) ? mbciOtherCount + 1 : mbciOtherCount;
                    bciOtherCount = (v.bci) ? bciOtherCount + 1 : bciOtherCount;
                    return v
                })
            let responseObj = {
                "setSelectedApplication": [],
                "setApplicationCFFData": { ...appCFFData, 'count': addZero(cffFinalData.length), 'bciCount': addZero(bciCFFCount), 'mbciCount': addZero(mbciCFFCount)},
                "setApplicationOSData": { ...appOSData, 'count': addZero(osFinalData.length), 'bciCount': addZero(bciOSCount), 'mbciCount': addZero(mbciOSCount)},
                "setApplicationOtherData": { ...appOtherData, 'count': addZero(otherFinalData.length), 'bciCount': addZero(bciOtherCount), 'mbciCount': addZero(mbciOtherCount)},
                "setIncidentData": finalData,
            }
            dispatch(Actions.setServiceViewIncident(responseObj))
            // dispatch(Actions.setIsLoading(false))
    }
    }

    static fetchStatusPage(market) {
        let timeRange;
        switch(market.endTime) {
            case '1h':
                timeRange = 60
                break;
            case '12h':
                timeRange = 720
                break;
            case '24h':
                timeRange = 1440
                break;
            // case '7d':
            //     timeRange = 10080
            //     break;
            // case '1mon':
            //     timeRange = 43200
            //     break;
            // case '3mon':
            //     timeRange = 129600
            //     break;
            default:
                timeRange = 1440
        }

        return dispatch => {
            httpCall('prediction', 'GET', baseURL + `getJourney?mins=${timeRange}`)
                .then(response => {
                    response.json().then(result => {
                        let lastData = {};
                        if (result.data && result.data.length > 0) {
                            lastData = getMarketImpact(result.data[0], 0);
                        }
                        dispatch(Actions.setStatusPage({ 'report': result.data, 'lastData': lastData}))
                        dispatch(Actions.setIsLoading(false))
                    })
                 })
        }
    }

    static fetchE2ETrend(market) {
        let timeRange = new Date(market.endDate).getTime() - new Date(market.startDate).getTime();

        return dispatch => {
            httpCall('prediction', 'GET', baseURL + `getE2EJourneyTrend?mins=${timeRange}&marketID=${market.id}`)
                .then(response => {
                    response.json().then(result => {
                        const resObj = {
                            "applications": ["isell", "iSOM", "CWIS", "Centiro", "Astro"],
                            "yaxsMarket": ['Astro', 'Centiro', 'CWIS', 'iSOM', 'isell'],
                            ...result.data
                        }
                        let applicationDataSet = []
                        result.dataSets.map(v => {
                            v.applicationDataSet.map(av => {
                                applicationDataSet.push(av)
                            })
                        })
                        resObj.applicationDataSet = applicationDataSet
                        // resObj.failedMarket = result.data.reduce((pVal, cVal) => pVal + cVal.failedMarket, 0)
                        dispatch(Actions.setE2EFlow(resObj))
                    })
                })
        }
    }

    static fetchE2EDetailed(market) {
        let timeRange = new Date(market.endDate).getTime() - new Date(market.startDate).getTime();

        return dispatch => {
            httpCall('prediction', 'GET', baseURL + `getE2EJourney?mins=${timeRange}&marketID=${market.id}`)
                .then(response => {
                    response.json().then(result => {
                        dispatch(Actions.setE2EFlowDetailed(result.data))
                    })
                })
        }
    }

    static fetchProductFlow(market) {

        let earlist = (market.startDate).getTime()
        let latest = (market.endDate).getTime()

        return dispatch => {
            httpCall('prediction', 'GET', baseURL + `getProductFlow?market=${market.id}&earlist=${earlist}&latest=${latest}`)
                .then(response => {
                    response.json().then(result => {
                        dispatch(Actions.setProductFlowData(result.data))
                    })
                })
        }
    }

    static fetchProductFlowTrends(market) {

        let earlist = (market.startDate).getTime()
        let latest = (market.endDate).getTime()

        return dispatch => {
            httpCall('prediction', 'GET', baseURL + `getPFTrends?market=${market.id}&earlist=${earlist}&latest=${latest}`)
                .then(response => {
                    response.json().then(result => {
                        dispatch(Actions.setProductFlowTrends({
                            data: result.data,
                            tableData: result.rawData
                        }))
                    })
                })
        }
    }

    static fetchProductKPITrends(market, KPIName) {
        let earlist = (market.startDate).getTime();
        let latest = (market.endDate).getTime();

        return httpCall("prediction", "GET", baseURL + `getPFKPITrends?market=${market.id}&kpiName=${KPIName}&earlist=${earlist}&latest=${latest}`)
        .then(response =>
             response.json().then(result => {
                let resObj = {}
                if(result.data.length > 0) {
                    resObj = {
                            "data": result.data,
                            "error": false
                        };
                } else {
                    resObj = {
                        "data": [],
                        "error": true
                    };
                }
                return resObj;
        }))
        .catch(response => {
           throw response
        })
    }

    static fetchBusinessCustomerJourney(market) {
            return dispatch => {
                let latest = (market.endDate).getTime();
                let earlist;
                if(market.endTime == "12h"||market.endTime=="1d" || market.endTime=="1h" || market.endTime== "Today"){
                     earlist = (market.startDate).getTime();
                }
                else{
                    earlist = latest - (24 * 3600000);
                }
                httpCall('prediction', 'GET', baseURL + `getBusinessCustomerJourney?market=${market.id}&earlist=${earlist}&latest=${latest}`)
                     .then(response => {
                        response.json().then(result => {
                              dispatch(Actions.setBusinessCustomerJourneyData(result.data))
                         })
                     })  
                }
             
         }
    
/*

API VIEW API CALLS

*/
static fetchapiView() {
    return dispatch => {
        httpCall('splunk', 'GET', baseURL + 'get-api')
         .then(response => {
             if(response.error){
                 dispatch(Actions.setServerError(response))
             }
             else{
                    response.json().then(result => {
                        const withParentNode = result.items.map(v => {
                            let serviceArr = (v.service).split(':'); serviceArr.pop();
                            return { ...v, parentService: serviceArr.join(':'), children: [] }
                        })
                        const resData = getAPIViewData(withParentNode);
                        dispatch(Actions.setApiViewPanel(resData[0]))
                    })
                }
            })
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
    }
}

    /*
        *Prediction API Calls
    */

    static fetchWebTraffic(category) {
        return httpCall("prediction", "GET", webtraffic + `/${category}`)
        .then(response =>{
            if(response.error){
                dispatch(Actions.setServerError(response));
              }
              else{
             response.json().then(result => {
            return result.data;
        })
    }
    })
    .catch(response => {
        if(response.status=== 500){
            let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
        dispatch(Actions.setServerError(dataerror));
        }
    })
    }

    static fetchWebTrafficMore(hours) {
        return httpCall("prediction", "GET", webtrafficMore + `/${hours}`)
        .then(response => {
            if(response.error){
                dispatch(Actions.setServerError(response));
              }
              else{
              response.json().then(result => {
            return result.data;
        })
    }
    })
    .catch(response => {
        if(response.status=== 500){
            let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
        dispatch(Actions.setServerError(dataerror));
        }
    })
    }

    static fetchISELL() {
        return httpCall("prediction", "GET", database + `/isell`)
        .then(response => {
            if(response.error){
                dispatch(Actions.setServerError(response));
              }
              else{
                   response.json().then(result => {
            return result.data;
        })
    }
    })
    .catch(response => {
        if(response.status=== 500){
            let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
        dispatch(Actions.setServerError(dataerror));
        }
    })
    }

    static fetchISOM() {
        return httpCall("prediction", "GET", database + `/isom`)
        .then(response =>{
            if(response.error){
                dispatch(Actions.setServerError(response));
              }
              else{
                  response.json().then(result => {
            return result.data;
        })
    }
    })
    .catch(response => {
        if(response.status=== 500){
            let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
        dispatch(Actions.setServerError(dataerror));
        }
    })
    }

    // setAvailableViews
    static fetchViews() {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `getfeatures`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    dispatch(Actions.setAvailableViews(result));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static fetchRoles() {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `getroles`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    dispatch(Actions.setAvailableRoles(result));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static fetchRoleViewsList(ids) {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `getroleviewsList?ids=${ids}`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    const data = result.data.map(v => {
                        let tabKey = (v.viewName).replace(' ', '');
                        return {
                            "key": tabKey,
                            "text": v.viewName,
                            "tabPanelId": tabKey,
                            disabled: false
                        }
                    })
                    dispatch(Actions.setRoleViewsList(result));

                    dispatch(Actions.setRolesTab({'data': rolesTab}));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static fetchRoleViews(id) {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `getroleviews?id=${id}`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    dispatch(Actions.setRoleViews(result));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static createRole(postData) {
        const { name, addRole } = postData;
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `createrole?name=${name}&addRole=${addRole}`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    dispatch(Actions.setAvailableRoles(result));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static updateRole(postData) {
        const { addRole, removeRole } = postData;
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `updaterole?addRole=${addRole}&removeRole=${removeRole}`)
            .then(response => response.json().then(result =>{
                if(result.status === 'success'){
                    // Success Model box
                } else{
                    // Error modal box
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static fetchUsers() {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `getusers`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    dispatch(Actions.setAvailableUsers(result));
                }
                dispatch(Actions.setIsLoading(false))
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static fetchUserRoles(id) {
        let userRolesData;
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `getuserroles?id=${id}`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    userRolesData = { 'data': result.data }
                    dispatch(Actions.setUserRoles(userRolesData));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static fetchApproval() {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `getapprovals`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    dispatch(Actions.setAvailableApproval(result));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static fetchVerify() {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `auth`)
            .then(response => response.json().then(result =>{
                if(result.data){
                    dispatch(Actions.setAvailableApproval(result));
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static verifyUser(email) {
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `verifyUser?email=${email}`)
            .then(response => response.json().then(result =>{
                if(result && result.data && result.data.length > 0) {
                    let isAdmin = result.data.filter(v => v.roleName === 'Admin')
                    if (isAdmin.length > 0) {
                        dispatch(Actions.setIsAdmin(true))
                    }
                    dispatch(Actions.setUserRoles(result.data));
                    dispatch(Middleware.fetchRoles())
                    dispatch(Middleware.fetchRoleViewsList((result.data.map(v => v.roleId)).toString()))
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static createRequest(postData) {
        const { name, email, addRole, removeRole } = postData;
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `requestrole?name=${name}&email=${email}&addRole=${addRole}&removeRole=${removeRole}`)
            .then(response => response.json().then(result =>{
                if(result.status === 'success'){
                    // Success Model box
                } else{
                    // Error modal box
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static updateRequest(postData) {
        const { addRole, removeRole } = postData;
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `updateuser?addRole=${addRole}&removeRole=${removeRole}`)
            .then(response => response.json().then(result =>{
                if(result.status === 'success' && result.data){
                    // Success Model box
                    dispatch(Actions.setAvailableUsers(result));
                } else{
                    // Error modal box
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static approveRequest(postData) {
        const { reqId, name, email, addRole, removeRole } = postData;
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `approveRequest?reqId=${reqId}&name=${name}&email=${email}&addRole=${addRole}&removeRole=${removeRole}`)
            .then(response => response.json().then(result =>{
                if(result.status === 'success'){
                    // Success Model box
                    dispatch(Actions.setAvailableApproval(result));
                    dispatch(Middleware.fetchUsers())
                } else{
                    // Error modal box
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }

    static rejectRequest(postData) {
        const { reqId, email } = postData;
        return dispatch => {
            httpCall("prediction", "GET", baseURL + `rejectRequest?reqId=${reqId}&email=${email}`)
            .then(response => response.json().then(result =>{
                if(result.status === 'success' && result.data){
                    // Success Model box
                    dispatch(Actions.setAvailableApproval(result));
                } else{
                    // Error modal box
                }
            }))
            .catch(response => {
                if(response.status=== 500){
                    let dataerror = { 'error': true, 'errorCode': '500', 'errorMessage': 'Internal Server Error'}
                    dispatch(Actions.setServerError(dataerror));
                }
            })
        }
    }


    /*
   HeatMap View Data
  */
    static fetchheatMapData(result, startDate) {
        let finalObj = {};
        const { Incident_details } = result;
        //const {Incident_details} = incidentData;
        return dispatch => {
            Incident_details
                .filter(v => (v.type == "MBCI")
                    && heatMapApplication[v.PRODUCT_NAME]
                    && (new Date(v.Submit_Date)) > startDate)
                .map((v) => {
                    let mbciNumberArr = (v.DESCRIPTION).match(/MBCI *(\d{3})/);
                    let mbciNumber;
                    if (mbciNumberArr.length && mbciNumberArr.length > 0) {
                        mbciNumber = mbciNumberArr[1]
                    }

                    var d = new Date(v.Submit_Date);
                    var mm = d.getMonth() + 1;
                    var dd = d.getDate();
                    var Submit_Date = '(' + dd + '/' + mm + ')';

                    if (!finalObj[v.PRODUCT_NAME]) finalObj[v.PRODUCT_NAME] = [];

                    finalObj[v.PRODUCT_NAME].push({
                        OWNER_GROUP: v.OWNER_GROUP,
                        Submit_Date: v.Submit_Date,
                        CATEGORIZATION_TIER_1: v.CATEGORIZATION_TIER_1,
                        DESCRIPTION: v.DESCRIPTION,
                        PRODUCT_NAME: v.PRODUCT_NAME,
                        STATUS: v.ops_status,
                        DETAILED_DESCRIPTION: v.DETAILED_DESCRIPTION,
                        LastModifiedDate: v.LastModifiedDate,
                        INCIDENT_NUMBER: v.INCIDENT_NUMBER,
                        mbci: mbciNumber,
                        mbciDetails: mbciNumber + ' ' + Submit_Date
                    });
                });
            dispatch(Actions.setheatMapData(finalObj));
        }
    }

}
