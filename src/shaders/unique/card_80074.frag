#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.65,1.0,length((p-c)/r));
}
float lineDistance(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
float fissure(vec2 p,vec2 a,vec2 b,float aa) {
    float d=lineDistance(p,a,b);
    return 1.0-smoothstep(0.0015,0.004+aa*0.55,d);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // Art ends before the upper edge of the stat plates; the left shield
    // badge is excluded including its entire rim. No scan coordinates move.
    float art=smoothstep(0.140,0.154,p.y)*(1.0-smoothstep(0.544,0.557,p.y));
    art*=smoothstep(0.021,0.039,p.x)*(1.0-smoothstep(0.959,0.979,p.x));
    art*=smoothstep(0.055,0.071,length((p-vec2(0.108,0.180))*vec2(1.0,1.4113)));
    vec3 color=scan.rgb;
    float hotInk=smoothstep(0.07,0.32,scan.r-scan.b)*smoothstep(0.20,0.60,scan.r);
    float shield=oval(p,vec2(0.722,0.339),vec2(0.115,0.155));
    float ground=oval(p,vec2(0.747,0.509),vec2(0.237,0.058));
    float shoulder=oval(p,vec2(0.215,0.264),vec2(0.171,0.113));

    // Liquid fire courses down the great stone shield through its painted
    // split, before the rules' rivers of lava fan out across the glacier.
    float cracks=fissure(p,vec2(0.709,0.253),vec2(0.679,0.293),aa)
                +fissure(p,vec2(0.679,0.293),vec2(0.729,0.326),aa)
                +fissure(p,vec2(0.729,0.326),vec2(0.710,0.380),aa)
                +fissure(p,vec2(0.710,0.380),vec2(0.738,0.430),aa)
                +fissure(p,vec2(0.738,0.430),vec2(0.706,0.490),aa)
                +fissure(p,vec2(0.729,0.326),vec2(0.774,0.303),aa);
    cracks=min(cracks,1.0)*shield;
    float cascade=pow(0.5+0.5*sin(p.y*68.0-t*5.4+seed),5.0);
    color+=vec3(0.70,0.23,0.012)*cracks*(0.25+0.85*cascade);
    color+=vec3(0.32,0.085,0.003)*hotInk*(shield+ground)*(0.25+0.65*cascade);

    float rivers=0.0;
    float riverHeads=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        vec2 a=vec2(0.711,0.497);
        vec2 b=vec2(0.468,0.546);
        if(i==1) b=vec2(0.942,0.524);
        if(i==2) b=vec2(0.879,0.548);
        vec2 d=b-a;
        float f=clamp(dot(p-a,d)/dot(d,d),0.0,1.0);
        vec2 center=a+d*f;
        center.y+=sin(f*13.0+k*2.0-t*2.4)*0.0035*sin(f*3.14159);
        float dist=length((p-center)*vec2(1.0,1.4113));
        float lane=(1.0-smoothstep(0.0025,0.0075+aa*0.55,dist))*sin(f*3.14159);
        float pulse=pow(0.5+0.5*cos(f*16.0-t*5.1+k*1.8+seed),5.0);
        rivers+=lane*(0.28+pulse*0.72);
        riverHeads+=lane*pulse;
    }
    color=mix(color,vec3(0.71,0.12,0.005),clamp(rivers*0.50,0.0,0.55));
    color+=vec3(0.60,0.32,0.016)*riverHeads;

    // Large, short ballistic ember trails remain readable in a compact card.
    // Their source is the orange splash at the shield's foot, not the sky.
    float embers=0.0;
    float emberHalo=0.0;
    for(int i=0;i<15;i++) {
        float k=float(i);
        float f=fract(t*(0.30+0.015*mod(k,3.0))+k*0.618034+seed*0.07);
        float velocity=fract(sin(k*29.17+seed)*1357.4);
        float spread=(velocity-0.42)*0.42;
        vec2 c=vec2(0.719+spread*f,0.499-(0.19+0.07*velocity)*f+0.13*f*f);
        vec2 tail=c-vec2(spread,-0.19-0.07*velocity+0.26*f)*0.075;
        float dist=lineDistance(p*vec2(1.0,1.4113),c*vec2(1.0,1.4113),tail*vec2(1.0,1.4113));
        float fade=smoothstep(0.0,0.13,f)*(1.0-smoothstep(0.70,1.0,f));
        embers+=(1.0-smoothstep(0.0013,0.0036+aa*0.48,dist))*fade;
        emberHalo+=exp(-dist/0.010)*fade;
    }
    color+=vec3(0.73,0.32,0.015)*embers+vec3(0.16,0.026,0.0)*emberHalo;
    float shoulderWave=pow(0.5+0.5*sin(p.x*35.0+p.y*31.0+t*4.2+seed),3.0);
    color+=vec3(0.47,0.16,0.012)*shoulder*hotInk*(0.22+shoulderWave);

    if(u_is_foil) {
        // Cold hammered rainbow metal on basalt contrasts with hot gold lava.
        // Broad colour bands are present even with animation frozen at t=0.
        vec3 spectrum=0.5+0.5*cos(6.2831853*(p.x*1.65+p.y*1.35-t*0.12+seed*0.05+vec3(0.0,0.33,0.67)));
        vec3 coated=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float body=oval(p,vec2(0.414,0.345),vec2(0.291,0.218));
        color=mix(color,coated,(0.28+0.29*max(body,shield))*(1.0-hotInk*0.78));
        float seam=pow(0.5+0.5*sin(p.x*21.0+p.y*30.0-t*1.8+seed),13.0);
        color+=(1.0-color)*(spectrum*0.29+vec3(0.05,0.06,0.07))*seam*(0.35+0.65*max(body,shield));
        color+=vec3(0.13,0.12,0.025)*hotInk*(0.55+0.45*seam);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
