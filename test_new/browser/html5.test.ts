import { runScenarios } from "./harness";

runScenarios('html5', 'normal', [
  {
    name: 'html5 elements selection test',
    html: `
      <h1>NWSAPI HTML5 elements selection test</h1>

      <p>Usual nonsense content...</p>

      <p>
        <abbr id="IBA" title="International Barbershop Association">IBA</abbr>
        Located at <mark id="NUM">116</mark> Messina Avenue, London NW6 4LD
        <abbr id="UK" title="United Kingdom">UK</abbr>
      </p>

      <section>
        <ul>
          <li id="first">First</li>
          <li id="second">Second</li>
          <li id="last">Last</li>
        </ul>
      </section>

      <hr>
    `,
    cases: [
      { selector: 'abbr:first-of-type', expect: { ids: ['IBA'] } },
      { selector: 'abbr:last-of-type', expect: { ids: ['UK'] } },
      { selector: 'mark:only-of-type', expect: { ids: ['NUM'] } },
      { selector: 'abbr:nth-of-type(1)', expect: { ids: ['IBA'] } },
      { selector: 'abbr:nth-of-type(2)', expect: { ids: ['UK'] } },
      { selector: 'abbr:nth-last-of-type(1)', expect: { ids: ['UK'] } },
      { selector: 'abbr:nth-last-of-type(2)', expect: { ids: ['IBA'] } },
      { selector: 'section li:first-of-type', expect: { ids: ['first'] } },
      { selector: 'section li:last-of-type', expect: { ids: ['last'] } },
    ],
  },

  {
    name: 'table :not() selector test',
    modifier: 'fixme',
    html: `
      <div>
        <h1>&nbsp;Your Search Results</h1>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tbody>
            <tr>
              <td colspan="7">You searched for: all records</td>
            </tr>
            <tr align="right">
              <td colspan="7">Showing matches 1 to 10 of 1405</td>
            </tr>
            <tr>
              <td colspan="7">&nbsp;</td>
            </tr>
            <tr>
              <td align="center"><strong>Photo</strong></td>
              <td><strong>Reg Number </strong></td>
              <td><strong>Make &amp; Model</strong></td>
              <td><strong>Colour</strong></td>
              <td><strong>Stolen From </strong></td>
              <td><strong>Date / Time stolen</strong></td>
              <td width="100%">&nbsp;</td>
            </tr>
            <tr class="TableRowLine">
              <td><img src="" width="64" height="1"></td>
              <td><img src="" width="90" height="1"></td>
              <td><img src="" width="110" height="1"></td>
              <td><img src="" width="75" height="1"></td>
              <td><img src="" width="100" height="1"></td>
              <td><img src="" width="290" height="1"></td>
              <td><img src="" width="1" height="1"></td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1429&amp;src=881407&amp;pn=0" id="AV11UXA">AV11UXA</a></td>
              <td>Mercedes-benz E Class Convertible </td>
              <td>White <br>    </td>
              <td>London</td>
              <td>23rd April 2015 Between midday and 3pm</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1428&amp;src=881407&amp;pn=0">LD64FKO</a></td>
              <td>Honda CB500F  </td>
              <td>Black <br>    </td>
              <td>London</td>
              <td>22nd April 2015 in the afternoon</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1427&amp;src=881407&amp;pn=0">YN58 LXV</a></td>
              <td>Peugeot XPS CT 125  </td>
              <td>Black <br>    </td>
              <td>Shropshire</td>
              <td>20th April 2015 Between midnight and 3am</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1426&amp;src=881407&amp;pn=0">YA08JZR</a></td>
              <td>PEUYGEOT PARTNER ORIGIN  </td>
              <td>White <br>    </td>
              <td>Staffordshire</td>
              <td>17th April 2015 Between 3am and 6am</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1425&amp;src=881407&amp;pn=0">DF03 KXB</a></td>
              <td>Baimo RSR 125  </td>
              <td>Blue <br>    </td>
              <td>Hampshire</td>
              <td>19th April 2015 Between midnight and 3am</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1424&amp;src=881407&amp;pn=0">YG62 CM0</a></td>
              <td>Audi A4  </td>
              <td>Grey <br>    </td>
              <td>West Midlands</td>
              <td>14th April 2015 Between midnight and 3am</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1423&amp;src=881407&amp;pn=0">FT10 FDV</a></td>
              <td>Seat Ibiza  </td>
              <td>White <br>    </td>
              <td>South Yorkshire</td>
              <td>9th April 2015 in the afternoon</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1422&amp;src=881407&amp;pn=0">RJ61 WRE</a></td>
              <td>Volkswagen Golf 1.6 TDi Bluemotion Tech Match </td>
              <td>Red <br>    </td>
              <td>Dyfed</td>
              <td>5th March 2015 Between 3pm and 6pm</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1421&amp;src=881407&amp;pn=0">SR11 HLO</a></td>
              <td>Mazda Mazda3 Takuya </td>
              <td>Silver <br>    </td>
              <td>London</td>
              <td>2nd April 2015 Between 9pm and midnight</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td align="center"><img src="" style="padding-top:2px;padding-bottom:2px;"></td>
              <td><a href="http://www.twoc.co.uk/view_rec.htm?id=1420&amp;src=881407&amp;pn=0">TNZ 9284</a></td>
              <td>Citroen Berlingo GB9HXC </td>
              <td>White <br>    </td>
              <td>Bedfordshire</td>
              <td>16th March 2015 time unknown</td>
              <td><form style="display:inline;" action="/report_theft/step1.htm" method="post" enctype="application/x-www-form-urlencoded">
              </form>
              </td>
            </tr>
            <tr>
              <td colspan="7" class="TableRowLine"><img src="" width="1" height="1"></td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
    cases: [
      {
        selector: 'tbody > tr:nth-of-type(n+6):not(:nth-of-type(17)) > td:nth-of-type(2) > a:not(:nth-of-type(2))',
        expect: { ids: ['AV11UXA'] },
      },
    ],
  },
]);