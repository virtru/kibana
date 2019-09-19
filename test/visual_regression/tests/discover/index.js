/*
* Licensed to Elasticsearch B.V. under one or more contributor
* license agreements. See the NOTICE file distributed with
* this work for additional information regarding copyright
* ownership. Elasticsearch B.V. licenses this file to you under
* the Apache License, Version 2.0 (the "License"); you may
* not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*    http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import { DEFAULT_OPTIONS } from '../../services/visual_testing/visual_testing';

// Width must be the same as visual_testing or canvas image widths will get skewed
const [SCREEN_WIDTH] = DEFAULT_OPTIONS.widths || [];

export default function ({ getService, loadTestFile }) {
  const esArchiver = getService('esArchiver');
  const browser = getService('browser');

  // FLAKY: https://github.com/elastic/kibana/issues/45713
  describe.skip('discover app', function () {
    this.tags('ciGroup6');

    before(function () {
      return browser.setWindowSize(SCREEN_WIDTH, 1000);
    });

    after(function unloadMakelogs() {
      return esArchiver.unload('logstash_functional');
    });

    loadTestFile(require.resolve('./chart_visualization'));
  });
}