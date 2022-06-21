import React, { useEffect, useState } from 'react';
import { Col, Row, Container } from 'react-bootstrap';
import OSServices from '../OSServices';
//import ColumnChart from '../../Charts/ColumnChart';
import BusinessMultiLineChart from '../../Charts/BusinessMultiLineChart';

import { convertToCount } from '../../../utils';
import { Store } from '../../../redux/Store';
import Toggle from '@ingka/toggle';
import { Select, Option, OptGroup } from "@ingka/select";

import datachart from '@ingka/ssr-icon/paths/data-chart';
import piechart from '@ingka/ssr-icon/paths/pie-chart';
import text from '@ingka/ssr-icon/paths/text';

import './OSHistoricalView.scss';
import ImageToolTip from '../../common/Tooltip';
const flowviewIcon = './assets/images/icon_flowview.svg';

const OSHistoricalView = ({itHealthscore}) => {

    const contentHeight = localStorage.getItem('contentHeight')
    const dynamicChartHeight = contentHeight - (390);
    const [trendsData, setTrendsData] = useState(Store.getState().flowOShistorical)
    const [selectedMarket, setMarketFilter] = useState(Store.getState().selectedMarket)
    const [flowOSData, setFlowOSData] = useState(Store.getState().flowOSData)
    const [isloading, setIsLoading] = useState(Store.getState().isLoading)
    const [dynamicHeight, setDynamicHeight] = useState(dynamicChartHeight);
    const [showChart, setshowChart] = useState(true);
    const [showTable, setshowTable] = useState(true);


    let serviceMonitor = flowOSData && flowOSData.osServiceHealth;

    useEffect(() => {
        let isSubscribed = true;
        const unsubscribe = Store.subscribe(() => {
            if(isSubscribed){
                setMarketFilter(Store.getState().selectedMarket)
                setFlowOSData(Store.getState().flowOSData);
                setTrendsData(Store.getState().flowOShistorical);
                setIsLoading(Store.getState().isLoading);
            }
        })
        return function clearnup() {
            unsubscribe();
            isSubscribed = false;
        }
    }, [])

    let value;
    if (flowOSData && flowOSData.osOrderedCount) {
        value = flowOSData.osOrderedCount;
    }

 //   useEffect(() => {
    //     let itHealthData = [
    //         {
    //             color: serviceMonitor.alert_color,
    //             score: Math.round(serviceMonitor.alert_value)
    //         }
    //     ]
    //     itHealthscore(itHealthData)
    //    }, []);


    const toggleChart = (index) => {
        if (index.clickIndex === 1) {
            setshowChart(false);
        } else {
            setshowChart(true);
        }
    }

    const toggleTable = (index) => {
        if (index.clickIndex === 1) {
            setshowTable(false);
        } else {
            setshowTable(true);
        }
    }


    return (
        <React.Fragment>
            <Container fluid className="flow-contentSelected-align">
                <Row>
                    <Col sm={12} md={12} lg={12} xl={12}>
                        <Row sm={12} md={12} lg={12} xl={12}>
                            <Col className='new-flow-contentSelected_itServicehealth fs-20'>IT service health</Col>
                            <Col className='new_Flow-contentSelected_itServiceToggle fs-20'>
                                <span>
                                    <Toggle
                                        iconOnly={true}
                                        // activeIndex = 0
                                        buttons={[
                                            { ssrIcon: datachart },
                                            { ssrIcon: piechart }]}
                                        fluid={false}
                                        onClick={(eventObj, index) => toggleChart({ clickIndex: index })}
                                    />
                                </span>
                            </Col>
                        </Row>
                    </Col>

                    {showChart ?
                        <React.Fragment>
                            <Col sm={12} md={12} lg={12} xl={12}>
                                <Row sm={12} md={12} lg={12} xl={12} className="new_Flow-contentSelected-flowhealth">
                                    <Col className="new_Flow-contentSelected-flowhealth-row">
                                        {!isloading &&
                                            <div className="flow-trend-view-info__selection fs-14">
                                                <span className="flow-trend-view-info__left">{selectedMarket && selectedMarket.label}</span>
                                                <span className="flow-trend-view-info__right">flow health</span>
                                            </div>
                                        }
                                    </Col>

                                    <Col className="new_Flow-contentSelected-flowhealth-row">
                                        <Toggle
                                            iconOnly={true}
                                            buttons={[
                                                { ssrIcon: datachart },
                                                { ssrIcon: text }]}
                                            fluid={false}
                                            onClick={(eventObj, index) => toggleTable({ clickIndex: index })}
                                        />
                                    </Col>

                                    <Col>
                                        <Select label="" className={!showTable ? "business-content-gray-out" : ""}>
                                            <Option className="BusinessView-contentSelected-Dropdown-options" value='' name="All" />
                                            <Option value="browsability" name="Browsability" />
                                            <Option value="showability" name="Showability" />
                                            <Option value="buyability" name="Buyability" />
                                            <Option value="cpb" name="CPB" />
                                        </Select>
                                    </Col>
                                </Row>
                            </Col>

                            <Col sm={12} md={12} lg={12} xl={12} className="BusinessView-contentSelected-flowhealth">

                                <Col sm={12} md={12} lg={12} xs={12} className="flow-trend-view" style={{ height: dynamicHeight, position: 'relative' }}>
                                    {trendsData.data && !trendsData.error ?
                                        <div className="flow-trend-view-chart">
                                            {showTable ?
                                            <BusinessMultiLineChart data={trendsData.data} market={selectedMarket} multiTrend='Online Shopping' />
                                            :
                                            <Col className="business-content-ProductFlowTable tab-display" >
                                            <div sm={12} md={12} lg={12} className="business-content-productTable">
                                            <div sm={12} md={12} lg={12}>
                                                <table className="table table--inset">
                                                    <thead className="table-header--sticky business-content-tableHeader">
                                                        <tr>
                                                            <th style={{ width: '16%' }}>Date</th>
                                                            <th style={{ width: '13%' }} >CIA</th>
                                                            <th style={{ width: '15%' }}>Kategorisera</th>
                                                            <th style={{ width: '14%' }}>ORM</th>
                                                            <th style={{ width: '16%' }}>Selling Range</th>
                                                            <th style={{ width: '16%' }}>Service Health Score</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="business-content-ProductFlowTable-tbody">                                                    
                                                        {trendsData && trendsData.rawData.map((v, i) => {
                                                            return (<tr key={`tTBL_${i}`}>
                                                                <th style={{ width: '16%' }}>{v.date} </th>
                                                                <th style={{ width: '16%' }}>{v.cia}</th>
                                                                <th style={{ width: '16%' }}>{v.category}</th>
                                                                <th style={{ width: '16%' }}>{v.sellingComm}</th>
                                                                <th style={{ width: '16%' }}>{v.sellingPrice}</th>
                                                                <th style={{ width: '16%' }}>{v.serviceHealthScore}</th>
                                                            </tr>)
                                                        })}
                                                    </tbody>
                                                </table>

                                            </div>
                                            </div></Col>
                                            }
                                        </div>

                                        :
                                        <Row className="justify-content-center">
                                            <div className="NoDataAvailable__textAlignOS">
                                                <div className="NoDataAvailable__SphereImg mt-4"
                                                    style={{ background: 'rgb(204, 204, 204)' }} >
                                                    <img src={flowviewIcon} className="NoDataAvailable__imgIcons img-fluid"></img>
                                                </div>
                                                <div className="NoDataAvailable-sphereShadow"></div>
                                                <div className="NoDataAvailable-text fs-14">Data not available</div>
                                            </div>
                                        </Row>
                                    }
                                </Col>
                            </Col>

                        </React.Fragment>
                        :
                            <Col sm={12} md={12} lg={12} xl={12} className="flow-contentSelected-align-left ">
                                <OSServices />
                            </Col>
                    }

                    


                    {/* </Row> */}
                    {/* <Row className="flow-content-ordersDetail">
                    <Col sm={12} md={12} className="d-flex flow-content-list">
                        <Col md={3}>
                            <div className="flow-content-data1">
                                <div className="flow-content__orders">
                                    <div className="cfflow-content-ordered-details__text fs-16">
                                        Orders paid</div><br />
                                    <ImageToolTip content={value && value} direction="top" name="">
                                        <div className="cfflow-content-text fs-30">  {value && convertToCount(value)} </div>
                                    </ImageToolTip>
                                </div>
                            </div>
                        </Col>
                        <Col md={3} className="text-left cfflow-content-KPIborder">
                            <div className="flow-content-data2 gray-out">
                                <div className="flow-content__orders fs-16">KPI<span className="fs-30"> &nbsp;01</span></div></div>
                        </Col>
                        <Col md={3} className="text-left cfflow-content-KPIborder">
                            <div className="flow-content-data3 gray-out fs-25">
                                <div className="flow-content__orders fs-16">KPI<span className="fs-30"> &nbsp;02</span></div></div>
                        </Col>

                    </Col>*/}
                </Row>
            </Container>
        </React.Fragment>
    )
}

export default OSHistoricalView