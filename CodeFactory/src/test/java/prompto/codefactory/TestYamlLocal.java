package prompto.codefactory;

import static org.junit.Assert.*;

import java.net.URL;

import org.junit.Test;
import org.junit.experimental.categories.Category;

import de.flapdoodle.embed.mongo.MongodExecutable;
import prompto.codefactory.Application;
import prompto.runtime.Mode;
import prompto.server.AppServer;
import prompto.store.mongo.BaseMongoTest;
import prompto.utils.ManualTests;

@Category(ManualTests.class)
public class TestYamlLocal {

	@Test
	public void testThatCodeServerRunsWithYamlLocal() throws Throwable {
		MongodExecutable mongo = BaseMongoTest.startMongo(27017);
		try {
			URL url = Thread.currentThread().getContextClassLoader().getResource("local.yml");
			String[] args = new String[] { "-yamlConfigFile", url.getFile() };
			Application.main(args, Mode.UNITTEST);
			assertTrue(AppServer.isStarted());
			assertEquals(8000, ModuleProcess.portRangeConfiguration.getMinPort());
			assertEquals(9000, ModuleProcess.portRangeConfiguration.getMaxPort());
		} finally {
			BaseMongoTest.stopMongo(mongo);
		}
	}
	
}
